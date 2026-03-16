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

  // 3D 視域
  private viewshedLines: THREE.LineSegments | null = null;
  private viewshedLineMat: THREE.LineBasicMaterial | null = null;
  private viewshedFan: THREE.Mesh | null = null;
  private viewshedFanMat: THREE.ShaderMaterial | null = null;

  // 靜態軌跡
  private staticMesh: THREE.LineSegments | null = null;
  private staticGlowMesh: THREE.LineSegments | null = null;
  private lastStaticKey = "";

  // Per-vertex alpha 可見度控制（±12h）
  private staticFlightRanges = new Map<string, { start: number; count: number }>();
  private lastVisibleIds = new Set<string>();
  private staticAlphaAttr: THREE.BufferAttribute | null = null;

  // Progressive 軌跡模式
  private staticTimestamps: Float32Array | null = null;
  private progressiveMode = false;
  private lastProgressiveTime = 0;

  // 漸進式靜態軌跡建構
  private staticBuildState: {
    flights: Flight[];
    positions: Float32Array;
    colors: Float32Array;
    alphas: Float32Array;
    timestamps: Float32Array;
    flightIdx: number;
    pointIdx: number;
    offset: number;
    cOffset: number;
    aOffset: number;
    tOffset: number;
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
    const timestamps = new Float32Array(totalVerts);
    this.staticTimestamps = timestamps;

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
      timestamps,
      flightIdx: 0,
      pointIdx: 0,
      offset: 0,
      cOffset: 0,
      aOffset: 0,
      tOffset: 0,
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

        state.timestamps[state.tOffset++] = a[3];
        state.timestamps[state.tOffset++] = b[3];

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

  setProgressiveMode(enabled: boolean) {
    if (this.progressiveMode === enabled) return;
    this.progressiveMode = enabled;
    this.lastProgressiveTime = 0;
    if (!enabled && this.staticAlphaAttr) {
      // 關閉 progressive 時，恢復全部可見
      const alphas = this.staticAlphaAttr.array as Float32Array;
      for (let i = 0; i < alphas.length; i++) {
        alphas[i] = 1.0;
      }
      this.staticAlphaAttr.needsUpdate = true;
    }
  }

  updateProgressiveVisibility(currentTime: number) {
    if (!this.progressiveMode || !this.staticAlphaAttr || !this.staticTimestamps) return;
    if (Math.abs(currentTime - this.lastProgressiveTime) < 1) return;
    this.lastProgressiveTime = currentTime;

    const alphas = this.staticAlphaAttr.array as Float32Array;
    const ts = this.staticTimestamps;
    let changed = false;

    for (let i = 0; i < alphas.length; i++) {
      const shouldShow = ts[i]! <= currentTime ? 1.0 : 0.0;
      if (alphas[i] !== shouldShow) {
        alphas[i] = shouldShow;
        changed = true;
      }
    }

    if (changed) {
      this.staticAlphaAttr.needsUpdate = true;
    }
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
    this.staticTimestamps = null;
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
    this.staticTimestamps = null;
  }

  /**
   * 更新 3D 視域掃描線
   * arcPoints: 地面弧線的 [lng, lat] 陣列（左+右兩側）
   * originLat/Lng/Alt: 飛機位置
   */
  updateViewshedLines(
    arcPoints: [number, number][],
    originLat: number, originLng: number, originAlt: number,
    isSatellite: boolean,
    opacity: number = 0.5,
  ) {
    if (arcPoints.length === 0) {
      this.clearViewshedLines();
      return;
    }

    const origin = toMercator(originLat, originLng, originAlt);
    const lineCount = arcPoints.length;
    const vertCount = lineCount * 2; // 每條線 2 個頂點

    if (!this.viewshedLines) {
      const color = isSatellite
        ? new THREE.Color(1.0, 0.82, 0.3)    // 金黃
        : (this.isDarkTheme
          ? new THREE.Color(1.0, 1.0, 1.0)   // 白
          : new THREE.Color(1.0, 0.6, 0.15)); // 橘

      this.viewshedLineMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.15 * opacity,
        blending: this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        depthTest: false,
      });

      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(vertCount * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      this.viewshedLines = new THREE.LineSegments(geo, this.viewshedLineMat);
      this.viewshedLines.frustumCulled = false;
      this.scene.add(this.viewshedLines);
    }

    // 更新顏色
    if (this.viewshedLineMat) {
      if (isSatellite) {
        this.viewshedLineMat.color.setRGB(1.0, 0.82, 0.3);
      } else if (this.isDarkTheme) {
        this.viewshedLineMat.color.setRGB(1.0, 1.0, 1.0);
      } else {
        this.viewshedLineMat.color.setRGB(1.0, 0.6, 0.15);
      }
      this.viewshedLineMat.blending = this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.viewshedLineMat.opacity = 0.15 * opacity;
    }

    const geo = this.viewshedLines.geometry;
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    // 確保 buffer 大小足夠
    if (arr.length < vertCount * 3) {
      const newArr = new Float32Array(vertCount * 3);
      geo.setAttribute("position", new THREE.BufferAttribute(newArr, 3));
      geo.setDrawRange(0, vertCount);
      this.updateViewshedPositions(geo, arcPoints, origin);
    } else {
      geo.setDrawRange(0, vertCount);
      this.updateViewshedPositions(geo, arcPoints, origin);
    }
  }

  private updateViewshedPositions(
    geo: THREE.BufferGeometry,
    arcPoints: [number, number][],
    origin: { x: number; y: number; z: number },
  ) {
    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    let offset = 0;

    for (const [lng, lat] of arcPoints) {
      // 起點：飛機位置
      arr[offset++] = origin.x;
      arr[offset++] = origin.y;
      arr[offset++] = origin.z;
      // 終點：地面
      const ground = toMercator(lat, lng, 0);
      arr[offset++] = ground.x;
      arr[offset++] = ground.y;
      arr[offset++] = ground.z;
    }

    posAttr.needsUpdate = true;
  }

  /**
   * 更新 3D 視域扇形 mesh（取代 Mapbox GeoJSON）
   * rings: 每側的漸層環（由 getViewshedRings 產生）
   */
  updateViewshedFans(
    rings: { arc: [number, number][]; alpha: number }[],
    originLat: number, originLng: number,
    isSatellite: boolean,
    opacity: number = 0.5,
  ) {
    if (rings.length === 0) {
      if (this.viewshedFan) this.viewshedFan.visible = false;
      return;
    }

    const origin = toMercator(originLat, originLng, 0);
    const segments = rings[0]!.arc.length - 1; // arc 有 segments+1 個點
    const ringCount = rings.length;

    // 頂點數：1 中心 + ringCount × (segments+1) 弧線頂點
    const vertPerSide = 1 + ringCount * (segments + 1);
    const totalVerts = vertPerSide * 2; // 左 + 右兩側
    // 三角形數：per side = segments (center fan) + (ringCount-1) * segments * 2 (ring strips)
    const trisPerSide = segments + (ringCount - 1) * segments * 2;
    const totalTris = trisPerSide * 2;

    if (!this.viewshedFanMat) {
      const color = isSatellite
        ? new THREE.Color(1.0, 0.82, 0.3)
        : (this.isDarkTheme ? new THREE.Color(1.0, 1.0, 1.0) : new THREE.Color(1.0, 0.6, 0.15));

      this.viewshedFanMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: color },
          uOpacity: { value: opacity },
        },
        vertexShader: `
          attribute float alpha;
          varying float vAlpha;
          void main() {
            vAlpha = alpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying float vAlpha;
          void main() {
            gl_FragColor = vec4(uColor, uOpacity * vAlpha);
          }
        `,
        transparent: true,
        blending: this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      });

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3));
      geo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(totalVerts), 1));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(totalTris * 3), 1));

      this.viewshedFan = new THREE.Mesh(geo, this.viewshedFanMat);
      this.viewshedFan.frustumCulled = false;
      this.scene.add(this.viewshedFan);
    }

    // 更新 uniforms
    const colorU = this.viewshedFanMat.uniforms["uColor"]!;
    if (isSatellite) {
      (colorU.value as THREE.Color).setRGB(1.0, 0.82, 0.3);
    } else if (this.isDarkTheme) {
      (colorU.value as THREE.Color).setRGB(1.0, 1.0, 1.0);
    } else {
      (colorU.value as THREE.Color).setRGB(1.0, 0.6, 0.15);
    }
    this.viewshedFanMat.uniforms["uOpacity"]!.value = opacity;
    this.viewshedFanMat.blending = this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;

    this.viewshedFan!.visible = true;

    const geo = this.viewshedFan!.geometry;
    const posArr = (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;

    // 確保 buffer 夠大
    if (posArr.length < totalVerts * 3) {
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(totalVerts * 3), 3));
      geo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(totalVerts), 1));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(totalTris * 3), 1));
    }

    const pos = (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const alp = (geo.getAttribute("alpha") as THREE.BufferAttribute).array as Float32Array;
    const idx = geo.getIndex()!.array as Uint32Array;

    let vOff = 0; // vertex offset (per float)
    let aOff = 0; // alpha offset
    let iOff = 0; // index offset

    // 左右兩側共用同一個 rings array（左半在前，右半在後）
    // rings 已包含兩側的資料（caller 合併傳入）
    // 但我們需要知道哪些是左、哪些是右，這裡 rings 是合併的
    // 簡化：把所有 rings 視為一個大 fan，中心在 origin

    // 寫入兩側：sideIdx=0 是前半 rings，sideIdx=1 是後半
    const halfLen = rings.length / 2;

    for (let side = 0; side < 2; side++) {
      const baseVert = (vOff / 3);
      const sideRings = rings.slice(side * halfLen, (side + 1) * halfLen);

      // 中心頂點
      pos[vOff++] = origin.x;
      pos[vOff++] = origin.y;
      pos[vOff++] = origin.z;
      alp[aOff++] = 1.0; // 中心最亮

      // 各環頂點
      for (const ring of sideRings) {
        for (const [lng, lat] of ring.arc) {
          const m = toMercator(lat, lng, 0);
          pos[vOff++] = m.x;
          pos[vOff++] = m.y;
          pos[vOff++] = m.z;
          alp[aOff++] = ring.alpha;
        }
      }

      // 索引：center fan (center → ring0)
      const arcLen = sideRings[0]!.arc.length;
      const ring0Start = baseVert + 1;
      for (let s = 0; s < arcLen - 1; s++) {
        idx[iOff++] = baseVert; // center
        idx[iOff++] = ring0Start + s;
        idx[iOff++] = ring0Start + s + 1;
      }

      // 索引：ring strips (ring[i] → ring[i+1])
      for (let r = 0; r < sideRings.length - 1; r++) {
        const curStart = baseVert + 1 + r * arcLen;
        const nextStart = curStart + arcLen;
        for (let s = 0; s < arcLen - 1; s++) {
          idx[iOff++] = curStart + s;
          idx[iOff++] = nextStart + s;
          idx[iOff++] = curStart + s + 1;

          idx[iOff++] = curStart + s + 1;
          idx[iOff++] = nextStart + s;
          idx[iOff++] = nextStart + s + 1;
        }
      }
    }

    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("alpha") as THREE.BufferAttribute).needsUpdate = true;
    geo.getIndex()!.needsUpdate = true;
    geo.setDrawRange(0, iOff);
  }

  clearViewshedLines() {
    if (this.viewshedLines) {
      this.scene.remove(this.viewshedLines);
      this.viewshedLines.geometry.dispose();
      this.viewshedLineMat?.dispose();
      this.viewshedLines = null;
      this.viewshedLineMat = null;
    }
    if (this.viewshedFan) {
      this.scene.remove(this.viewshedFan);
      this.viewshedFan.geometry.dispose();
      this.viewshedFanMat?.dispose();
      this.viewshedFan = null;
      this.viewshedFanMat = null;
    }
  }

  dispose() {
    this.clearScene();
    this.clearViewshedLines();
    this.renderer.dispose();
  }
}
