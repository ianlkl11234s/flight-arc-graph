import * as THREE from "three";
import type { Flight, RenderMode, TrailPoint } from "../types";
import { toMercator } from "../utils/coordinates";
import { getTrailUpToTime } from "../utils/interpolation";
import { LightTrail } from "./LightTrail";
import { InstancedOrbs } from "./InstancedOrbs";

import staticTrailVert from "./shaders/staticTrail.vert?raw";
import staticTrailFrag from "./shaders/staticTrail.frag?raw";

/** 預計算的 Mercator 座標快取：[mx, my, mz, timestamp] */
type MercatorPoint = [number, number, number, number];

// 暗色主題調色盤（Additive Blending 用，淺色系）
const DARK_COLORS = [
  new THREE.Color(0.3, 0.6, 1.0),
  new THREE.Color(0.2, 0.8, 0.9),
  new THREE.Color(0.5, 0.4, 1.0),
  new THREE.Color(0.3, 0.9, 0.7),
  new THREE.Color(0.6, 0.5, 1.0),
];

// 亮色主題調色盤（Normal Blending 用，深飽和色系）
const LIGHT_COLORS = [
  new THREE.Color(0.05, 0.15, 0.6),  // 深藍
  new THREE.Color(0.6, 0.05, 0.15),  // 深紅
  new THREE.Color(0.3, 0.05, 0.55),  // 深紫
  new THREE.Color(0.0, 0.35, 0.35),  // 深青
  new THREE.Color(0.5, 0.25, 0.0),   // 深琥珀
];

/** Trail pool 上限：超過時回收最久未使用的 */
const MAX_TRAILS = 600;

interface TrailEntry {
  trail: LightTrail;
  lastUsedFrame: number;
}

/**
 * Three.js 場景管理器
 * 管理所有航班的光軌、光球、閃爍燈 + 靜態 3D 軌跡
 */
export class FlightScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer!: THREE.WebGLRenderer;

  private trails = new Map<string, TrailEntry>();
  private instancedOrbs: InstancedOrbs | null = null;
  private mercatorCache = new Map<string, MercatorPoint[]>();
  private colorIndex = 0;
  private frameCounter = 0;
  private currentOrbScale = 0.000005;
  private currentStaticOpacity = 0.2;
  private isDarkTheme = true;
  private showTrails = true;
  private lastMatrix: THREE.Matrix4 | null = null;

  // 靜態軌跡
  private staticMesh: THREE.LineSegments | null = null;
  private staticGlowMesh: THREE.LineSegments | null = null;
  private lastStaticKey = "";

  // Per-vertex alpha 可見度控制（±12h）
  private staticFlightRanges = new Map<string, { start: number; count: number }>();
  private lastVisibleIds = new Set<string>();
  private staticAlphaAttr: THREE.BufferAttribute | null = null;

  // 漸進式靜態軌跡建構
  private staticBuildState: {
    flights: Flight[];
    positions: Float32Array;
    colors: Float32Array;
    alphas: Float32Array;
    flightIdx: number;
    pointIdx: number;
    offset: number;
    cOffset: number;
    aOffset: number;
    totalVerts: number;
    builtVerts: number;
  } | null = null;
  private static readonly VERTS_PER_FRAME = 10000;

  private get colors() {
    return this.isDarkTheme ? DARK_COLORS : LIGHT_COLORS;
  }

  private get blending() {
    return this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;
  }

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
  }

  init(gl: WebGLRenderingContext) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: gl.canvas as HTMLCanvasElement,
      context: gl as unknown as WebGL2RenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    this.instancedOrbs = new InstancedOrbs(this.scene, this.colors[0]!, this.blending);
    this.instancedOrbs.setScale(this.currentOrbScale);
  }

  setTheme(isDark: boolean) {
    if (this.isDarkTheme === isDark) return;
    this.isDarkTheme = isDark;

    let idx = 0;
    for (const entry of this.trails.values()) {
      const color = this.colors[idx % this.colors.length]!;
      idx++;
      entry.trail.setColor(color);
      entry.trail.setBlending(this.blending);
    }

    this.instancedOrbs?.setTheme(this.colors[0]!, this.blending);
    this.forceRebuildStatic();
  }

  /**
   * 更新靜態軌跡 mesh
   * 漸進式建構：每幀處理一批頂點，產生逐步展開的動畫效果。
   * 幾何體用全量航班建構，可見度用 per-vertex alpha 增量控制。
   */
  updateStaticTrails(flights: Flight[], mode: RenderMode = "3d") {
    if (mode === "2d") {
      this.removeStaticMeshes();
      this.lastStaticKey = "";
      this.staticBuildState = null;
      return;
    }

    const key =
      flights.length === 0
        ? ""
        : `${flights.length}|${flights[0]!.fr24_id}|${flights[flights.length - 1]!.fr24_id}`;

    if (this.staticBuildState && key === this.lastStaticKey) {
      this.continueStaticBuild();
      return;
    }

    if (key === this.lastStaticKey) return;
    this.lastStaticKey = key;

    this.removeStaticMeshes();
    this.staticBuildState = null;
    this.staticFlightRanges.clear();
    this.lastVisibleIds.clear();
    this.staticAlphaAttr = null;

    if (flights.length === 0) return;

    let totalSegments = 0;
    for (const f of flights) {
      if (f.path.length >= 2) totalSegments += f.path.length - 1;
    }
    if (totalSegments === 0) return;

    const totalVerts = totalSegments * 2;
    const positions = new Float32Array(totalVerts * 3);
    const colors = new Float32Array(totalVerts * 3);
    const alphas = new Float32Array(totalVerts);

    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);
    this.staticAlphaAttr = alphaAttr;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", posAttr);
    geometry.setAttribute("color", colAttr);
    geometry.setAttribute("alpha", alphaAttr);
    geometry.setDrawRange(0, 0);

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", posAttr);
    glowGeo.setAttribute("color", colAttr);
    glowGeo.setAttribute("alpha", alphaAttr);
    glowGeo.setDrawRange(0, 0);

    const staticOpacity = this.isDarkTheme
      ? this.currentStaticOpacity
      : Math.min(this.currentStaticOpacity * 2.5, 0.7);

    const mat = new THREE.ShaderMaterial({
      vertexShader: staticTrailVert,
      fragmentShader: staticTrailFrag,
      uniforms: { uOpacity: { value: staticOpacity } },
      transparent: true,
      blending: this.blending,
      depthWrite: false,
    });
    this.staticMesh = new THREE.LineSegments(geometry, mat);
    this.staticMesh.frustumCulled = false;
    this.scene.add(this.staticMesh);

    const glowMat = new THREE.ShaderMaterial({
      vertexShader: staticTrailVert,
      fragmentShader: staticTrailFrag,
      uniforms: { uOpacity: { value: staticOpacity * 0.3 } },
      transparent: true,
      blending: this.blending,
      depthWrite: false,
    });
    this.staticGlowMesh = new THREE.LineSegments(glowGeo, glowMat);
    this.staticGlowMesh.frustumCulled = false;
    this.scene.add(this.staticGlowMesh);

    if (!this.showTrails) {
      this.staticMesh.visible = false;
      this.staticGlowMesh.visible = false;
    }

    this.staticBuildState = {
      flights,
      positions,
      colors,
      alphas,
      flightIdx: 0,
      pointIdx: 0,
      offset: 0,
      cOffset: 0,
      aOffset: 0,
      totalVerts,
      builtVerts: 0,
    };

    this.continueStaticBuild();
  }

  private continueStaticBuild() {
    const state = this.staticBuildState;
    if (!state || !this.staticMesh || !this.staticGlowMesh) return;

    const MAX_ALT = 13000;
    let lowR: number, lowG: number, lowB: number;
    let highR: number, highG: number, highB: number;

    if (this.isDarkTheme) {
      lowR = 1.0; lowG = 0.8; lowB = 0.5;
      highR = 0.5; highG = 0.75; highB = 1.0;
    } else {
      lowR = 0.6; lowG = 0.1; lowB = 0.05;
      highR = 0.05; highG = 0.15; highB = 0.55;
    }

    let vertsThisFrame = 0;
    const limit = FlightScene.VERTS_PER_FRAME;

    while (state.flightIdx < state.flights.length && vertsThisFrame < limit) {
      const f = state.flights[state.flightIdx]!;

      if (f.path.length < 2) {
        state.flightIdx++;
        state.pointIdx = 0;
        continue;
      }

      const startPt = state.pointIdx || 0;
      if (startPt === 0) {
        this.staticFlightRanges.set(f.fr24_id, {
          start: state.builtVerts + vertsThisFrame,
          count: 0,
        });
      }

      const flightVertStart = vertsThisFrame;

      for (let i = startPt; i < f.path.length - 1 && vertsThisFrame < limit; i++) {
        const a = f.path[i]!;
        const b = f.path[i + 1]!;
        const ma = toMercator(a[0], a[1], a[2]);
        const mb = toMercator(b[0], b[1], b[2]);

        state.positions[state.offset++] = ma.x;
        state.positions[state.offset++] = ma.y;
        state.positions[state.offset++] = ma.z;
        state.positions[state.offset++] = mb.x;
        state.positions[state.offset++] = mb.y;
        state.positions[state.offset++] = mb.z;

        let t = Math.min(Math.max(a[2] / MAX_ALT, 0), 1);
        state.colors[state.cOffset++] = lowR + (highR - lowR) * t;
        state.colors[state.cOffset++] = lowG + (highG - lowG) * t;
        state.colors[state.cOffset++] = lowB + (highB - lowB) * t;
        t = Math.min(Math.max(b[2] / MAX_ALT, 0), 1);
        state.colors[state.cOffset++] = lowR + (highR - lowR) * t;
        state.colors[state.cOffset++] = lowG + (highG - lowG) * t;
        state.colors[state.cOffset++] = lowB + (highB - lowB) * t;

        state.alphas[state.aOffset++] = 1.0;
        state.alphas[state.aOffset++] = 1.0;

        vertsThisFrame += 2;
        state.pointIdx = i + 1;
      }

      const range = this.staticFlightRanges.get(f.fr24_id);
      if (range) {
        range.count += (vertsThisFrame - flightVertStart);
      }

      if (state.pointIdx >= f.path.length - 1) {
        if (this.lastVisibleIds.size > 0 && !this.lastVisibleIds.has(f.fr24_id)) {
          const range = this.staticFlightRanges.get(f.fr24_id);
          if (range) {
            for (let i = range.start; i < range.start + range.count; i++) {
              state.alphas[i] = 0.0;
            }
          }
        }
        state.flightIdx++;
        state.pointIdx = 0;
      }
    }

    state.builtVerts += vertsThisFrame;

    const posAttr = this.staticMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = this.staticMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
    const alphaAttr = this.staticMesh.geometry.getAttribute("alpha") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    alphaAttr.needsUpdate = true;

    this.staticMesh.geometry.setDrawRange(0, state.builtVerts);
    this.staticGlowMesh.geometry.setDrawRange(0, state.builtVerts);

    if (state.builtVerts >= state.totalVerts) {
      this.staticBuildState = null;
    }
  }

  forceRebuildStatic() {
    this.lastStaticKey = "";
  }

  setStaticOpacity(innerOpacity: number) {
    this.currentStaticOpacity = innerOpacity;
    const effective = this.isDarkTheme
      ? innerOpacity
      : Math.min(innerOpacity * 2.5, 0.7);
    if (this.staticMesh) {
      (this.staticMesh.material as THREE.ShaderMaterial).uniforms["uOpacity"]!.value = effective;
    }
    if (this.staticGlowMesh) {
      (this.staticGlowMesh.material as THREE.ShaderMaterial).uniforms["uOpacity"]!.value = effective * 0.3;
    }
  }

  setOrbScale(scale: number) {
    this.currentOrbScale = scale;
    this.instancedOrbs?.setScale(scale);
  }

  setShowTrails(show: boolean) {
    if (this.showTrails === show) return;
    this.showTrails = show;
    if (this.staticMesh) this.staticMesh.visible = show;
    if (this.staticGlowMesh) this.staticGlowMesh.visible = show;
  }

  /**
   * 增量更新靜態軌跡可見度（±12h）
   * 只修改新進入/離開的航班的 per-vertex alpha，不重建幾何體。
   */
  updateStaticVisibility(visibleIds: Set<string>) {
    if (!this.staticAlphaAttr || this.staticFlightRanges.size === 0) return;

    const alphas = this.staticAlphaAttr.array as Float32Array;
    let changed = false;

    for (const id of visibleIds) {
      if (!this.lastVisibleIds.has(id)) {
        const range = this.staticFlightRanges.get(id);
        if (range) {
          for (let i = range.start; i < range.start + range.count; i++) {
            alphas[i] = 1.0;
          }
          changed = true;
        }
      }
    }

    for (const id of this.lastVisibleIds) {
      if (!visibleIds.has(id)) {
        const range = this.staticFlightRanges.get(id);
        if (range) {
          for (let i = range.start; i < range.start + range.count; i++) {
            alphas[i] = 0.0;
          }
          changed = true;
        }
      }
    }

    if (changed) {
      this.staticAlphaAttr.needsUpdate = true;
    }

    this.lastVisibleIds = new Set(visibleIds);
  }

  pickFlight(screenX: number, screenY: number, viewWidth: number, viewHeight: number): string | null {
    if (!this.lastMatrix || !this.instancedOrbs) return null;
    return this.instancedOrbs.pickFlight(screenX, screenY, viewWidth, viewHeight, this.lastMatrix);
  }

  private getMercatorPath(flight: Flight): MercatorPoint[] {
    let cached = this.mercatorCache.get(flight.fr24_id);
    if (cached) return cached;

    cached = new Array(flight.path.length);
    for (let i = 0; i < flight.path.length; i++) {
      const pt = flight.path[i]!;
      const mc = toMercator(pt[0], pt[1], pt[2]);
      cached[i] = [mc.x, mc.y, mc.z, pt[3]];
    }
    this.mercatorCache.set(flight.fr24_id, cached);
    return cached;
  }

  invalidateMercatorCache() {
    this.mercatorCache.clear();
  }

  update(activeFlights: Flight[], currentTime: number) {
    this.frameCounter++;
    const activeIds = new Set<string>();
    const orbEntries: Array<{ id: string; x: number; y: number; z: number }> = [];

    for (const flight of activeFlights) {
      activeIds.add(flight.fr24_id);

      let entry = this.trails.get(flight.fr24_id);
      if (!entry) {
        if (this.trails.size >= MAX_TRAILS) {
          this.evictOldestTrail();
        }
        entry = this.createTrailEntry(flight.fr24_id);
      }
      entry.lastUsedFrame = this.frameCounter;

      const mercatorPath = this.getMercatorPath(flight);
      const trail = getTrailUpToTime(mercatorPath as unknown as TrailPoint[], currentTime, 600) as unknown as MercatorPoint[];
      if (trail.length < 2) continue;

      entry.trail.updateTrailMercator(trail);
      entry.trail.setOpacity(this.isDarkTheme ? 0.8 : 1.0);

      const lastPt = trail[trail.length - 1]!;
      orbEntries.push({ id: flight.fr24_id, x: lastPt[0], y: lastPt[1], z: lastPt[2] });
    }

    this.instancedOrbs?.updateAll(orbEntries);

    for (const [id, entry] of this.trails) {
      if (!activeIds.has(id)) {
        entry.trail.setOpacity(0);
      }
    }
  }

  render(matrix: number[]) {
    const gl = this.renderer.getContext();

    const blendEnabled = gl.isEnabled(gl.BLEND);
    const blendSrc = gl.getParameter(gl.BLEND_SRC_RGB);
    const blendDst = gl.getParameter(gl.BLEND_DST_RGB);
    const blendSrcA = gl.getParameter(gl.BLEND_SRC_ALPHA);
    const blendDstA = gl.getParameter(gl.BLEND_DST_ALPHA);

    this.lastMatrix = new THREE.Matrix4().fromArray(matrix);
    this.camera.projectionMatrix = this.lastMatrix;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();

    if (blendEnabled) {
      gl.enable(gl.BLEND);
    } else {
      gl.disable(gl.BLEND);
    }
    gl.blendFuncSeparate(blendSrc, blendDst, blendSrcA, blendDstA);
  }

  private createTrailEntry(flightId: string): TrailEntry {
    const color = this.colors[this.colorIndex % this.colors.length]!;
    this.colorIndex++;

    const trail = new LightTrail(color, 512, this.blending);
    this.scene.add(trail.mesh);

    const entry: TrailEntry = { trail, lastUsedFrame: this.frameCounter };
    this.trails.set(flightId, entry);
    return entry;
  }

  private evictOldestTrail() {
    let oldestId: string | null = null;
    let oldestFrame = Infinity;

    for (const [id, entry] of this.trails) {
      if (entry.lastUsedFrame < oldestFrame) {
        oldestFrame = entry.lastUsedFrame;
        oldestId = id;
      }
    }

    if (oldestId) {
      const entry = this.trails.get(oldestId)!;
      this.scene.remove(entry.trail.mesh);
      entry.trail.dispose();
      this.trails.delete(oldestId);
    }
  }

  private removeStaticMeshes() {
    if (this.staticMesh) {
      this.scene.remove(this.staticMesh);
      this.staticMesh.geometry.dispose();
      (this.staticMesh.material as THREE.Material).dispose();
      this.staticMesh = null;
    }
    if (this.staticGlowMesh) {
      this.scene.remove(this.staticGlowMesh);
      this.staticGlowMesh.geometry.dispose();
      (this.staticGlowMesh.material as THREE.Material).dispose();
      this.staticGlowMesh = null;
    }
  }

  private clearScene() {
    for (const entry of this.trails.values()) {
      this.scene.remove(entry.trail.mesh);
      entry.trail.dispose();
    }
    this.trails.clear();
    this.mercatorCache.clear();
    this.colorIndex = 0;
    this.frameCounter = 0;
    this.instancedOrbs?.dispose();
    this.instancedOrbs = null;
    this.removeStaticMeshes();
    this.lastStaticKey = "";
    this.staticBuildState = null;
    this.staticFlightRanges.clear();
    this.lastVisibleIds.clear();
    this.staticAlphaAttr = null;
  }

  dispose() {
    this.clearScene();
    this.renderer.dispose();
  }
}
