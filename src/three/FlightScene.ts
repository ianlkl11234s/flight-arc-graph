import * as THREE from "three";
import type { Flight, RenderMode } from "../types";
import type { ColorTheme } from "../types/colorTheme";
import { COLOR_THEMES, DEFAULT_THEME_KEY, hexToRgb } from "../types/colorTheme";
import { toMercator } from "../utils/coordinates";
import { BatchedTrails } from "./BatchedTrails";
import { InstancedOrbs } from "./InstancedOrbs";

import staticTrailVert from "./shaders/staticTrail.vert?raw";
import staticTrailFrag from "./shaders/staticTrail.frag?raw";
import { GLOBE_PROJECT_GLSL, mercatorToEcef, GB_R } from "./shaders/globeProject";

/** 預計算的 Mercator 座標點：[mx, my, mz, timestamp] */
type MercatorPoint = [number, number, number, number];

/** 每航班快取：mercator path + per-point ECEF（動畫光軌用，三角函數每航班只算一次） */
interface FlightPathCache {
  pts: MercatorPoint[];
  ecef: Float32Array;
}

// 亮色主題 fallback（Normal Blending 用，深飽和色系）
const LIGHT_COLORS = [
  new THREE.Color(0.05, 0.15, 0.6),  // 深藍
  new THREE.Color(0.6, 0.05, 0.15),  // 深紅
  new THREE.Color(0.3, 0.05, 0.55),  // 深紫
  new THREE.Color(0.0, 0.35, 0.35),  // 深青
  new THREE.Color(0.5, 0.25, 0.0),   // 深琥珀
];

function themeToColors(theme: ColorTheme): THREE.Color[] {
  return theme.trailColors.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return new THREE.Color(r, g, b);
  });
}

/**
 * 靜態軌跡地理分桶：每桶一對 LineSegments（本體 + glow 共用 geometry / attributes），
 * 供 globe 模式下「桶整個在地平線背面」時整批 mesh.visible=false 剔除。
 */
interface StaticBucket {
  mesh: THREE.LineSegments;
  glowMesh: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  alphas: Float32Array;
  timestamps: Float32Array;
  ecefs: Float32Array;
  posAttr: THREE.BufferAttribute;
  colAttr: THREE.BufferAttribute;
  alphaAttr: THREE.BufferAttribute;
  ecefAttr: THREE.BufferAttribute;
  /** 已寫入頂點數（桶內 offset，同 drawRange 上限） */
  writeVerts: number;
  totalVerts: number;
  /** 桶格中心方向（單位 ECEF，固定軸）；minDotAxis = 已寫入頂點方向對軸的最小 dot（方向 cap 半角餘弦） */
  axis: { x: number; y: number; z: number };
  minDotAxis: number;
  culled: boolean;
}

/** update() 每幀重用的光軌頭部 scratch（避免每航班一次物件配置） */
const _trailHead = { x: 0, y: 0, z: 0 };

/** 靜態軌跡分桶網格：經度 30° × 緯度 45°（12×4 = 48 格；只建非空桶） */
const BUCKET_LNG_DEG = 30;
const BUCKET_LAT_DEG = 45;
const BUCKET_COLS = 360 / BUCKET_LNG_DEG;
const BUCKET_ROWS = 180 / BUCKET_LAT_DEG;

function bucketKeyOfLngLat(lat: number, lng: number): number {
  const lngN = ((lng % 360) + 540) % 360 - 180; // 跨換日線展開經度 normalize → [-180, 180)
  const latC = Math.min(90, Math.max(-90, lat));
  const col = Math.min(BUCKET_COLS - 1, Math.max(0, Math.floor((lngN + 180) / BUCKET_LNG_DEG)));
  const row = Math.min(BUCKET_ROWS - 1, Math.max(0, Math.floor((latC + 90) / BUCKET_LAT_DEG)));
  return row * BUCKET_COLS + col;
}

/** 桶格中心的單位 ECEF 方向（與 mercatorToEcef 同座標系，y 北為負） */
function bucketAxisOf(key: number): { x: number; y: number; z: number } {
  const row = Math.floor(key / BUCKET_COLS);
  const col = key % BUCKET_COLS;
  const lat = -90 + (row + 0.5) * BUCKET_LAT_DEG;
  const lng = -180 + (col + 0.5) * BUCKET_LNG_DEG;
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  return { x: Math.cos(phi) * Math.sin(lam), y: -Math.sin(phi), z: Math.cos(phi) * Math.cos(lam) };
}

/**
 * Three.js 場景管理器
 * 管理所有航班的光軌、光球、閃爍燈 + 靜態 3D 軌跡
 */
export class FlightScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer!: THREE.WebGLRenderer;

  /** 批次動畫光軌（單一 mesh / 單 draw call，slot 制，取代舊的 per-flight LightTrail 池） */
  private batchedTrails: BatchedTrails | null = null;
  private instancedOrbs: InstancedOrbs | null = null;
  /** 貼球共用 uniform（靜態/發光/所有動畫軌跡材質共用同一組 value 物件，每幀更新一次） */
  private globeUniforms = {
    uGlobeToMerc: { value: new THREE.Matrix4() },
    uTransition: { value: 1 },
    uCameraEcef: { value: new THREE.Vector3() },
    uLimbFade: { value: 0 },
  };
  private globeInvMatrix = new THREE.Matrix4();
  private mercatorCache = new Map<string, FlightPathCache>();
  private colorIndex = 0;
  /** fr24_id → 已指派的 theme-cycle 顏色（slot 逐出後重進場仍保持同色） */
  private flightColors = new Map<string, THREE.Color>();
  // 暫停快進偵測：時間/集合/樣式 epoch 都沒變 → 跳過光軌重寫（只推進光球動畫）
  private lastTrailTime = NaN;
  private lastActiveSig = "__init__";
  private trailEpoch = 0;
  private lastTrailEpoch = -1;
  private lastOrbEntries: Array<{ id: string; x: number; y: number; z: number }> = [];
  private currentOrbScale = 0.000005;
  private currentStaticOpacity = 0.2;
  // sub-pixel 細線因子（Width slider）；≤1，1=原始寬度。本體乘 w、glow 乘 w²
  private currentStaticWidth = 1;
  // Glow slider（airportGlow）值；≤0.01 時整層 glow mesh 跳過繪製（省 fill-rate）
  private currentGlowIntensity = 1;
  // glow mesh 是否整層停繪（glow 有效不透明度趨近 0 時）
  private glowHidden = false;
  private isDarkTheme = true;
  private showTrails = true;
  /** fr24_id → 強制指派顏色（用於 compare 模式、per-airport 模式）*/
  private perFlightColorMap: Map<string, THREE.Color> | null = null;
  /** 上次 setPerFlightColorMap 的內容簽章（避免 prop reference 變但內容相同時重建） */
  private lastColorMapSignature = "__init__";
  private colorTheme: ColorTheme = COLOR_THEMES[DEFAULT_THEME_KEY]!;
  private themeColors: THREE.Color[] = themeToColors(COLOR_THEMES[DEFAULT_THEME_KEY]!);
  private lastMatrix: THREE.Matrix4 | null = null;
  private matrixScratch = new THREE.Matrix4(); // render() 每幀重用，避免 new Matrix4
  /** 上一次 update() 的活躍光球數（repaint 閘控用：>0 代表有呼吸/閃爍動畫需持續重繪） */
  private activeOrbCount = 0;

  // 3D 視域
  private viewshedLines: THREE.LineSegments | null = null;
  private viewshedLineMat: THREE.LineBasicMaterial | null = null;
  private viewshedFan: THREE.Mesh | null = null;
  private viewshedFanMat: THREE.ShaderMaterial | null = null;
  private viewshedFanIndexBuilt = false; // index 拓撲是否已建
  private lastVsIsSatellite: boolean | null = null;
  private lastVsOpacity = -1;

  // 靜態軌跡（地理分桶，見 StaticBucket；材質全桶共用兩支）
  private staticBuckets: StaticBucket[] = [];
  private staticBucketByKey = new Map<number, StaticBucket>();
  private staticMat: THREE.ShaderMaterial | null = null;
  private staticGlowMat: THREE.ShaderMaterial | null = null;
  private lastStaticKey = "";

  // Per-vertex alpha 可見度控制（±12h）；start 為桶內 offset
  private staticFlightRanges = new Map<string, { bucket: StaticBucket; start: number; count: number }>();
  private lastVisibleIds = new Set<string>();

  // Progressive 軌跡模式
  private progressiveMode = false;
  private lastProgressiveTime = 0;

  // 漸進式靜態軌跡建構（頂點 buffer 在各桶內，寫入位置由 bucket.writeVerts 追蹤）
  private staticBuildState: {
    flights: Flight[];
    flightIdx: number;
    pointIdx: number;
    totalVerts: number;
    builtVerts: number;
  } | null = null;
  private static readonly VERTS_PER_FRAME = 10000;

  private get colors() {
    return this.isDarkTheme ? this.themeColors : LIGHT_COLORS;
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

    this.batchedTrails = new BatchedTrails(this.globeUniforms, this.blending);
    this.scene.add(this.batchedTrails.mesh);
  }

  setTheme(isDark: boolean) {
    if (this.isDarkTheme === isDark) return;
    this.isDarkTheme = isDark;
    this.applyColors();
  }

  setColorTheme(theme: ColorTheme) {
    this.colorTheme = theme;
    this.themeColors = themeToColors(theme);
    this.applyColors();
  }

  getColorTheme(): ColorTheme {
    return this.colorTheme;
  }

  /**
   * 設定 per-flight color 覆寫（例如以起飛機場分色）。
   * 傳 null 或空 Map → 回到 theme-cycle 配色。
   */
  setPerFlightColorMap(hexMap: Map<string, string> | null) {
    // 簽章：用 size + 前後幾個 entry 取樣（夠抓出內容差異，不用全部 hash）
    const sig = !hexMap || hexMap.size === 0
      ? "empty"
      : (() => {
          let s = `${hexMap.size}|`;
          let n = 0;
          for (const [id, hex] of hexMap) {
            s += `${id}:${hex};`;
            if (++n >= 8) break;
          }
          return s;
        })();
    if (sig === this.lastColorMapSignature) return; // 內容相同 → 跳過，避免靜態 mesh 重建
    this.lastColorMapSignature = sig;

    if (!hexMap || hexMap.size === 0) {
      this.perFlightColorMap = null;
    } else {
      const m = new Map<string, THREE.Color>();
      for (const [id, hex] of hexMap) {
        const [r, g, b] = hexToRgb(hex);
        m.set(id, new THREE.Color(r, g, b));
      }
      this.perFlightColorMap = m;
    }
    this.applyColors();
    // 靜態 3D mesh 重建（per-vertex color 從 altitude gradient 換成 airport 色 / 反之）
    this.forceRebuildStatic();
  }

  private applyColors() {
    // 顏色 cycle 重置 + epoch 推進 → 下一次 update()（同幀 render 前）以新配色重寫全部光軌
    this.flightColors.clear();
    this.colorIndex = 0;
    this.trailEpoch++;
    this.batchedTrails?.setBlending(this.blending);

    const orbColor = this.isDarkTheme
      ? (() => { const [r, g, b] = hexToRgb(this.colorTheme.orbGlow); return new THREE.Color(r, g, b); })()
      : this.colors[0]!;
    this.instancedOrbs?.setTheme(orbColor, this.blending);
    this.forceRebuildStatic();
  }

  /** 光軌顏色：perFlightColorMap 覆寫優先，否則 theme-cycle（同舊 createTrailEntry 邏輯） */
  private colorForFlight(flightId: string): THREE.Color {
    const override = this.perFlightColorMap?.get(flightId);
    if (override) return override;
    let c = this.flightColors.get(flightId);
    if (!c) {
      c = this.colors[this.colorIndex % this.colors.length]!;
      this.colorIndex++;
      this.flightColors.set(flightId, c);
    }
    return c;
  }

  /**
   * 航班 → 桶 key（依 path 中點的 lng/lat 落格）。
   * light theme 用 NormalBlending，繪製順序影響混色 → 全部進單一桶，
   * 順序與舊的單一 mesh 完全一致（分桶剔除只在 dark/additive 模式生效）。
   */
  private bucketKeyForFlight(f: Flight): number {
    if (!this.isDarkTheme) return 0;
    const mid = f.path[Math.floor(f.path.length / 2)]!;
    return bucketKeyOfLngLat(mid[0], mid[1]);
  }

  /**
   * 更新靜態軌跡 mesh
   * 漸進式建構：每幀處理一批頂點，產生逐步展開的動畫效果。
   * 幾何體用全量航班建構（按地理分桶），可見度用 per-vertex alpha 增量控制。
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

    if (flights.length === 0) return;

    // 計數 pass：每桶頂點數（先算好才能一次配足桶 buffer）
    const bucketVertCounts = new Map<number, number>();
    let totalVerts = 0;
    for (const f of flights) {
      if (f.path.length < 2) continue;
      const verts = (f.path.length - 1) * 2;
      const k = this.bucketKeyForFlight(f);
      bucketVertCounts.set(k, (bucketVertCounts.get(k) ?? 0) + verts);
      totalVerts += verts;
    }
    if (totalVerts === 0) return;

    const staticOpacity = this.isDarkTheme
      ? this.currentStaticOpacity
      : Math.min(this.currentStaticOpacity * 2.5, 0.7);

    // 材質全桶共用（uniform 更新一次全桶生效；draw call 便宜）
    this.staticMat = new THREE.ShaderMaterial({
      vertexShader: GLOBE_PROJECT_GLSL + staticTrailVert,
      fragmentShader: staticTrailFrag,
      uniforms: { uOpacity: { value: staticOpacity }, uWidth: { value: this.currentStaticWidth }, ...this.globeUniforms },
      transparent: true,
      blending: this.blending,
      depthWrite: false,
      depthTest: false, // globe 底圖 depth（far=∞）會誤遮貼球航跡，故關閉；背面靠 shader cull 藏
    });
    this.staticGlowMat = new THREE.ShaderMaterial({
      vertexShader: GLOBE_PROJECT_GLSL + staticTrailVert,
      fragmentShader: staticTrailFrag,
      uniforms: { uOpacity: { value: staticOpacity * 0.3 }, uWidth: { value: this.currentStaticWidth * this.currentStaticWidth }, ...this.globeUniforms },
      transparent: true,
      blending: this.blending,
      depthWrite: false,
      depthTest: false, // globe 底圖 depth（far=∞）會誤遮貼球航跡，故關閉；背面靠 shader cull 藏
    });

    for (const [k, verts] of bucketVertCounts) {
      const positions = new Float32Array(verts * 3);
      const colors = new Float32Array(verts * 3);
      const alphas = new Float32Array(verts);
      const timestamps = new Float32Array(verts);
      const ecefs = new Float32Array(verts * 3); // 貼球 ECEF（CPU 預存，shader 直接乘矩陣）

      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      const alphaAttr = new THREE.BufferAttribute(alphas, 1);
      const ecefAttr = new THREE.BufferAttribute(ecefs, 3);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", posAttr);
      geometry.setAttribute("color", colAttr);
      geometry.setAttribute("alpha", alphaAttr);
      geometry.setAttribute("aEcef", ecefAttr);
      geometry.setDrawRange(0, 0);

      // 本體 + glow 共用同一 geometry（drawRange/attribute 永遠同步）
      const mesh = new THREE.LineSegments(geometry, this.staticMat);
      mesh.frustumCulled = false;
      const glowMesh = new THREE.LineSegments(geometry, this.staticGlowMat);
      glowMesh.frustumCulled = false;
      mesh.visible = this.showTrails;
      glowMesh.visible = this.showTrails && !this.glowHidden;
      this.scene.add(mesh);
      this.scene.add(glowMesh);

      const bucket: StaticBucket = {
        mesh,
        glowMesh,
        geometry,
        positions,
        colors,
        alphas,
        timestamps,
        ecefs,
        posAttr,
        colAttr,
        alphaAttr,
        ecefAttr,
        writeVerts: 0,
        totalVerts: verts,
        axis: bucketAxisOf(k),
        minDotAxis: 1,
        culled: false,
      };
      this.staticBuckets.push(bucket);
      this.staticBucketByKey.set(k, bucket);
    }

    this.staticBuildState = {
      flights,
      flightIdx: 0,
      pointIdx: 0,
      totalVerts,
      builtVerts: 0,
    };

    this.continueStaticBuild();
  }

  private continueStaticBuild() {
    const state = this.staticBuildState;
    if (!state || this.staticBuckets.length === 0) return;

    const MAX_ALT = 13000;

    // 多色停漸層
    const gradientStops: [number, number, number][] = this.isDarkTheme
      ? this.colorTheme.staticGradient.map((hex) => hexToRgb(hex))
      : [[0.6, 0.1, 0.05], [0.05, 0.15, 0.55]];

    const lerpGradient = (t: number): [number, number, number] => {
      if (gradientStops.length === 1) return gradientStops[0]!;
      const segments = gradientStops.length - 1;
      const seg = Math.min(Math.floor(t * segments), segments - 1);
      const localT = t * segments - seg;
      const a = gradientStops[seg]!;
      const b = gradientStops[seg + 1]!;
      return [
        a[0] + (b[0] - a[0]) * localT,
        a[1] + (b[1] - a[1]) * localT,
        a[2] + (b[2] - a[2]) * localT,
      ];
    };

    let vertsThisFrame = 0;
    const limit = FlightScene.VERTS_PER_FRAME;
    const dirtyBuckets = new Set<StaticBucket>();

    while (state.flightIdx < state.flights.length && vertsThisFrame < limit) {
      const f = state.flights[state.flightIdx]!;

      if (f.path.length < 2) {
        state.flightIdx++;
        state.pointIdx = 0;
        continue;
      }

      const bucket = this.staticBucketByKey.get(this.bucketKeyForFlight(f))!;
      const startPt = state.pointIdx || 0;
      if (startPt === 0) {
        this.staticFlightRanges.set(f.fr24_id, {
          bucket,
          start: bucket.writeVerts,
          count: 0,
        });
      }

      const bucketVertStart = bucket.writeVerts;
      // 若此 flight 有指定顏色（per-airport 模式），整條 trail 使用平色，忽略 altitude gradient
      const airportOverride = this.perFlightColorMap?.get(f.fr24_id) ?? null;
      const ax = bucket.axis.x, ay = bucket.axis.y, az = bucket.axis.z;

      for (let i = startPt; i < f.path.length - 1 && vertsThisFrame < limit; i++) {
        const a = f.path[i]!;
        const b = f.path[i + 1]!;
        const ma = toMercator(a[0], a[1], a[2]);
        const mb = toMercator(b[0], b[1], b[2]);

        const w = bucket.writeVerts;
        const o3 = w * 3;
        bucket.positions[o3] = ma.x;
        bucket.positions[o3 + 1] = ma.y;
        bucket.positions[o3 + 2] = ma.z;
        bucket.positions[o3 + 3] = mb.x;
        bucket.positions[o3 + 4] = mb.y;
        bucket.positions[o3 + 5] = mb.z;

        // 貼球 ECEF 預存（一次性 CPU 算，取代 shader 每幀 exp/atan/sin/cos）
        mercatorToEcef(ma.x, ma.y, ma.z, bucket.ecefs, o3);
        mercatorToEcef(mb.x, mb.y, mb.z, bucket.ecefs, o3 + 3);
        // 方向 cap 統計（culling 用）：頂點單位方向對桶軸的最小 dot
        for (let e = o3; e <= o3 + 3; e += 3) {
          const ex = bucket.ecefs[e]!, ey = bucket.ecefs[e + 1]!, ez = bucket.ecefs[e + 2]!;
          const d = (ex * ax + ey * ay + ez * az) / Math.hypot(ex, ey, ez);
          if (d < bucket.minDotAxis) bucket.minDotAxis = d;
        }

        if (airportOverride) {
          const r = airportOverride.r, g = airportOverride.g, bl = airportOverride.b;
          bucket.colors[o3] = r;
          bucket.colors[o3 + 1] = g;
          bucket.colors[o3 + 2] = bl;
          bucket.colors[o3 + 3] = r;
          bucket.colors[o3 + 4] = g;
          bucket.colors[o3 + 5] = bl;
        } else {
          let t = Math.min(Math.max(a[2] / MAX_ALT, 0), 1);
          let [cr, cg, cb] = lerpGradient(t);
          bucket.colors[o3] = cr;
          bucket.colors[o3 + 1] = cg;
          bucket.colors[o3 + 2] = cb;
          t = Math.min(Math.max(b[2] / MAX_ALT, 0), 1);
          [cr, cg, cb] = lerpGradient(t);
          bucket.colors[o3 + 3] = cr;
          bucket.colors[o3 + 4] = cg;
          bucket.colors[o3 + 5] = cb;
        }

        bucket.alphas[w] = 1.0;
        bucket.alphas[w + 1] = 1.0;

        bucket.timestamps[w] = a[3];
        bucket.timestamps[w + 1] = b[3];

        bucket.writeVerts += 2;
        vertsThisFrame += 2;
        state.pointIdx = i + 1;
      }

      const range = this.staticFlightRanges.get(f.fr24_id);
      if (range) {
        range.count += (bucket.writeVerts - bucketVertStart);
      }
      dirtyBuckets.add(bucket);

      if (state.pointIdx >= f.path.length - 1) {
        if (this.lastVisibleIds.size > 0 && !this.lastVisibleIds.has(f.fr24_id)) {
          const r = this.staticFlightRanges.get(f.fr24_id);
          if (r) {
            for (let i = r.start; i < r.start + r.count; i++) {
              r.bucket.alphas[i] = 0.0;
            }
          }
        }
        state.flightIdx++;
        state.pointIdx = 0;
      }
    }

    state.builtVerts += vertsThisFrame;

    // 只更新本幀有寫入的桶（buffer 上傳也只針對這些桶，避免全量 re-upload）
    for (const b of dirtyBuckets) {
      b.posAttr.needsUpdate = true;
      b.colAttr.needsUpdate = true;
      b.alphaAttr.needsUpdate = true;
      b.ecefAttr.needsUpdate = true;
      b.geometry.setDrawRange(0, b.writeVerts);
    }

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
    if (this.staticMat) {
      this.staticMat.uniforms["uOpacity"]!.value = effective;
    }
    if (this.staticGlowMat) {
      this.staticGlowMat.uniforms["uOpacity"]!.value = effective * 0.3;
    }
    this.recomputeGlowVisibility();
  }

  /**
   * sub-pixel 細線因子（Width slider）。WebGL lineWidth 固定 1px，幾何上不可能更細，
   * 故用降低 alpha 模擬：本體乘 w、glow 乘 w²（glow 衰減更陡，細的時候先消失只剩銳利細線）。
   * w≥1 對 3D 貼球軌跡無效（clamp 到 1，維持基準寬度）；細化只在 w<1 生效。
   */
  setStaticWidth(width: number) {
    const w = Math.min(Math.max(width, 0), 1);
    this.currentStaticWidth = w;
    if (this.staticMat) {
      this.staticMat.uniforms["uWidth"]!.value = w;
    }
    if (this.staticGlowMat) {
      this.staticGlowMat.uniforms["uWidth"]!.value = w * w;
    }
    this.recomputeGlowVisibility();
  }

  /** Far View 球緣寬淡出（軌跡 shader 用，與 InstancedOrbs limbFade 一致）；0=關、1=開 */
  setLimbFade(on: boolean) {
    this.globeUniforms.uLimbFade.value = on ? 1 : 0;
  }

  /** Glow slider（airportGlow）值；驅動 glow mesh 的整層跳過閘控 */
  setGlowIntensity(intensity: number) {
    if (this.currentGlowIntensity === intensity) return;
    this.currentGlowIntensity = intensity;
    this.recomputeGlowVisibility();
  }

  /**
   * 依「glow 有效不透明度」決定是否整層停繪 glow mesh（省 fill-rate）：
   * glow 最大有效 alpha = bodyOpacity × 0.3 × w²；≤ 0.01 或 Glow slider≈0 時停繪。
   */
  private recomputeGlowVisibility() {
    const bodyOpacity = this.isDarkTheme
      ? this.currentStaticOpacity
      : Math.min(this.currentStaticOpacity * 2.5, 0.7);
    const glowMax = bodyOpacity * 0.3 * this.currentStaticWidth * this.currentStaticWidth;
    const hidden = this.currentGlowIntensity <= 0.01 || glowMax <= 0.01;
    this.setGlowHidden(hidden);
  }

  /** 套用 glow mesh 停繪狀態（與 showTrails / 剔除狀態合成，不互相覆蓋） */
  private setGlowHidden(hidden: boolean) {
    if (this.glowHidden === hidden) return;
    this.glowHidden = hidden;
    for (const b of this.staticBuckets) {
      b.glowMesh.visible = this.showTrails && !b.culled && !hidden;
    }
  }

  setOrbScale(scale: number) {
    this.currentOrbScale = scale;
    this.instancedOrbs?.setScale(scale);
  }

  /** Per-flight scale multiplier（按機型分類大小）；null = 還原為全 1.0 */
  setPerFlightScaleMap(map: Map<string, number> | null) {
    this.instancedOrbs?.setScaleMap(map);
  }

  setShowTrails(show: boolean) {
    if (this.showTrails === show) return;
    this.showTrails = show;
    for (const b of this.staticBuckets) {
      b.mesh.visible = show && !b.culled;
      b.glowMesh.visible = show && !b.culled && !this.glowHidden;
    }
  }

  /**
   * 增量更新靜態軌跡可見度（±12h）
   * 只修改新進入/離開的航班的 per-vertex alpha，不重建幾何體。
   */
  updateStaticVisibility(visibleIds: Set<string>) {
    if (this.staticBuckets.length === 0 || this.staticFlightRanges.size === 0) return;

    const changedBuckets = new Set<StaticBucket>();

    for (const id of visibleIds) {
      if (!this.lastVisibleIds.has(id)) {
        const range = this.staticFlightRanges.get(id);
        if (range) {
          for (let i = range.start; i < range.start + range.count; i++) {
            range.bucket.alphas[i] = 1.0;
          }
          changedBuckets.add(range.bucket);
        }
      }
    }

    for (const id of this.lastVisibleIds) {
      if (!visibleIds.has(id)) {
        const range = this.staticFlightRanges.get(id);
        if (range) {
          for (let i = range.start; i < range.start + range.count; i++) {
            range.bucket.alphas[i] = 0.0;
          }
          changedBuckets.add(range.bucket);
        }
      }
    }

    for (const b of changedBuckets) {
      b.alphaAttr.needsUpdate = true;
    }

    this.lastVisibleIds = new Set(visibleIds);
  }

  setProgressiveMode(enabled: boolean) {
    if (this.progressiveMode === enabled) return;
    this.progressiveMode = enabled;
    this.lastProgressiveTime = 0;
    if (!enabled) {
      // 關閉 progressive 時，恢復全部可見
      for (const b of this.staticBuckets) {
        b.alphas.fill(1.0);
        b.alphaAttr.needsUpdate = true;
      }
    }
  }

  updateProgressiveVisibility(currentTime: number) {
    if (!this.progressiveMode || this.staticBuckets.length === 0) return;
    if (Math.abs(currentTime - this.lastProgressiveTime) < 1) return;
    this.lastProgressiveTime = currentTime;

    for (const b of this.staticBuckets) {
      const alphas = b.alphas;
      const ts = b.timestamps;
      let changed = false;
      for (let i = 0; i < b.writeVerts; i++) {
        const shouldShow = ts[i]! <= currentTime ? 1.0 : 0.0;
        if (alphas[i] !== shouldShow) {
          alphas[i] = shouldShow;
          changed = true;
        }
      }
      if (changed) {
        b.alphaAttr.needsUpdate = true;
      }
    }
  }

  pickFlight(screenX: number, screenY: number, viewWidth: number, viewHeight: number): string | null {
    if (!this.lastMatrix || !this.instancedOrbs) return null;
    return this.instancedOrbs.pickFlight(screenX, screenY, viewWidth, viewHeight, this.lastMatrix);
  }

  private getMercatorPath(flight: Flight): FlightPathCache {
    let cached = this.mercatorCache.get(flight.fr24_id);
    if (cached) return cached;

    const n = flight.path.length;
    const pts: MercatorPoint[] = new Array(n);
    const ecef = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const pt = flight.path[i]!;
      const mc = toMercator(pt[0], pt[1], pt[2]);
      pts[i] = [mc.x, mc.y, mc.z, pt[3]];
      mercatorToEcef(mc.x, mc.y, mc.z, ecef, i * 3); // 貼球 ECEF 一次算好（光軌每幀直接抄）
    }
    cached = { pts, ecef };
    this.mercatorCache.set(flight.fr24_id, cached);
    return cached;
  }

  invalidateMercatorCache() {
    this.mercatorCache.clear();
    this.trailEpoch++; // 座標基準變了（高度誇張/資料集切換）→ 強制光軌重寫
  }

  /**
   * 設定貼球參數（每幀由 custom layer 在 update() 前呼叫）。
   * globeToMerc = Mapbox projectionToMercatorMatrix；null 或 transition≥1 → 平面 mercator（現狀）。
   */
  setGlobe(
    globeToMerc: number[] | null,
    transition: number,
    cam: { x: number; y: number; z: number } | null,
  ) {
    let camValid = false;
    if (globeToMerc && globeToMerc.length >= 16) {
      this.globeUniforms.uGlobeToMerc.value.fromArray(globeToMerc);
      this.globeUniforms.uTransition.value = Math.max(0, Math.min(1, transition));
      // 相機轉回 ECEF：inverse(globeToMerc) · camMerc（背面剔除在真球面空間做才穩健）
      if (cam) {
        this.globeInvMatrix.copy(this.globeUniforms.uGlobeToMerc.value).invert();
        this.globeUniforms.uCameraEcef.value
          .set(cam.x, cam.y, cam.z)
          .applyMatrix4(this.globeInvMatrix);
        camValid = true;
      }
    } else {
      this.globeUniforms.uGlobeToMerc.value.identity();
      this.globeUniforms.uTransition.value = 1;
    }
    const active = this.globeUniforms.uTransition.value < 1;
    this.instancedOrbs?.setGlobe(
      active ? this.globeUniforms.uGlobeToMerc.value : null,
      this.globeUniforms.uTransition.value,
      active ? this.globeUniforms.uCameraEcef.value : null,
    );
    this.updateStaticCulling(camValid);
  }

  /**
   * 地平線背面剔除：桶的方向 cap（axis ± acos(minDotAxis)）完全落在球體地平線背面
   * （shader cull smoothstep 必輸出 0）時，整批 mesh.visible=false 跳過 vertex/fragment。
   * 只在 globe 模式（transition < 1）啟用；mercator 模式全開。保守判定，零畫面差異：
   * dot(dir, toCam) 對「dir 與相機方向的夾角」單調遞減，故取桶內最小夾角評估即為上界。
   */
  private updateStaticCulling(camValid: boolean) {
    if (this.staticBuckets.length === 0) return;
    const transition = this.globeUniforms.uTransition.value;
    const cam = this.globeUniforms.uCameraEcef.value;
    const dc = cam.length();
    const enabled = transition < 1 && camValid && dc > GB_R;

    for (const b of this.staticBuckets) {
      let culled = false;
      if (enabled && b.writeVerts > 0) {
        const cosG = (b.axis.x * cam.x + b.axis.y * cam.y + b.axis.z * cam.z) / dc;
        const gamma = Math.acos(Math.max(-1, Math.min(1, cosG)));
        const thetaB = Math.acos(Math.max(-1, Math.min(1, b.minDotAxis)));
        const gammaMin = Math.max(0, gamma - thetaB); // 桶內頂點方向與相機方向的最小夾角
        const cosT = Math.cos(gammaMin);
        // dot(dir, toCam) 解析式（同 shader cull，toCam 由地表投影點指向相機）
        const d = (dc * cosT - GB_R) / Math.sqrt(dc * dc + GB_R * GB_R - 2 * dc * GB_R * cosT);
        culled = d <= -0.085; // shader smoothstep 下界 -0.08 加浮點安全邊際
      }
      if (culled !== b.culled) {
        b.culled = culled;
        b.mesh.visible = this.showTrails && !culled;
        b.glowMesh.visible = this.showTrails && !culled && !this.glowHidden;
      }
    }
  }

  update(activeFlights: Flight[], currentTime: number) {
    const batch = this.batchedTrails;
    if (!batch) return;

    // 暫停/時間未動且集合與樣式都沒變：光軌內容不變，跳過整段 CPU 重寫與上傳，
    // 只推進光球呼吸/閃爍動畫（wall-clock，需每幀 updateAll）。
    const sig = activeFlights.length === 0
      ? ""
      : `${activeFlights.length}|${activeFlights[0]!.fr24_id}|${activeFlights[activeFlights.length - 1]!.fr24_id}`;
    if (
      currentTime === this.lastTrailTime &&
      sig === this.lastActiveSig &&
      this.trailEpoch === this.lastTrailEpoch
    ) {
      this.instancedOrbs?.updateAll(this.lastOrbEntries);
      this.activeOrbCount = this.lastOrbEntries.length;
      return;
    }
    this.lastTrailTime = currentTime;
    this.lastActiveSig = sig;
    this.lastTrailEpoch = this.trailEpoch;

    const activeIds = new Set<string>();
    const orbEntries: Array<{ id: string; x: number; y: number; z: number }> = [];
    const trailOpacity = this.isDarkTheme ? 0.8 : 1.0;

    for (const flight of activeFlights) {
      activeIds.add(flight.fr24_id);

      const cache = this.getMercatorPath(flight);
      const endTime = flight.path.length > 0 ? flight.path[flight.path.length - 1]![3] : currentTime;
      const written = batch.writeTrail(
        flight.fr24_id,
        endTime,
        cache.pts,
        cache.ecef,
        currentTime,
        this.colorForFlight(flight.fr24_id),
        trailOpacity,
        _trailHead,
      );
      if (!written) continue; // <2 點：無光軌也無光球（同舊行為）

      orbEntries.push({ id: flight.fr24_id, x: _trailHead.x, y: _trailHead.y, z: _trailHead.z });
    }

    batch.releaseMissing(activeIds); // 落地/離窗 → slot 立即釋放並隱藏（同舊 setOpacity(0)）
    batch.commit();

    this.instancedOrbs?.updateAll(orbEntries);
    this.activeOrbCount = orbEntries.length;
    this.lastOrbEntries = orbEntries;
  }

  /** repaint 閘控：靜態軌跡是否仍在漸進建構中（buffer 待更新） */
  isStaticBuilding(): boolean {
    return this.staticBuildState !== null;
  }

  /** repaint 閘控：是否有活躍光球（呼吸/閃爍為 wall-clock 動畫，需持續重繪） */
  hasActiveOrbs(): boolean {
    return this.activeOrbCount > 0;
  }

  render(matrix: number[]) {
    const gl = this.renderer.getContext();

    const blendEnabled = gl.isEnabled(gl.BLEND);
    const blendSrc = gl.getParameter(gl.BLEND_SRC_RGB);
    const blendDst = gl.getParameter(gl.BLEND_DST_RGB);
    const blendSrcA = gl.getParameter(gl.BLEND_SRC_ALPHA);
    const blendDstA = gl.getParameter(gl.BLEND_DST_ALPHA);

    this.matrixScratch.fromArray(matrix);
    this.lastMatrix = this.matrixScratch;
    this.camera.projectionMatrix = this.matrixScratch;
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

  private removeStaticMeshes() {
    for (const b of this.staticBuckets) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.glowMesh);
      b.geometry.dispose();
    }
    this.staticBuckets = [];
    this.staticBucketByKey.clear();
    this.staticMat?.dispose();
    this.staticMat = null;
    this.staticGlowMat?.dispose();
    this.staticGlowMat = null;
  }

  private clearScene() {
    if (this.batchedTrails) {
      this.scene.remove(this.batchedTrails.mesh);
      this.batchedTrails.dispose();
      this.batchedTrails = null;
    }
    this.mercatorCache.clear();
    this.colorIndex = 0;
    this.flightColors.clear();
    this.lastOrbEntries = [];
    this.lastTrailTime = NaN;
    this.lastActiveSig = "__init__";
    this.instancedOrbs?.dispose();
    this.instancedOrbs = null;
    this.removeStaticMeshes();
    this.lastStaticKey = "";
    this.staticBuildState = null;
    this.staticFlightRanges.clear();
    this.lastVisibleIds.clear();
  }

  /** 取得 viewshed 主題色 */
  private getViewshedColor(isSatellite: boolean): [number, number, number] {
    if (isSatellite) return [1.0, 0.82, 0.3];
    if (this.isDarkTheme) return [1.0, 1.0, 1.0];
    return [1.0, 0.6, 0.15];
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
      const [r, g, b] = this.getViewshedColor(isSatellite);
      this.viewshedLineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(r, g, b),
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

    // 材質只在變更時更新
    if (this.viewshedLineMat && (this.lastVsIsSatellite !== isSatellite || this.lastVsOpacity !== opacity)) {
      const [r, g, b] = this.getViewshedColor(isSatellite);
      this.viewshedLineMat.color.setRGB(r, g, b);
      this.viewshedLineMat.blending = this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;
      this.viewshedLineMat.opacity = 0.15 * opacity;
      this.lastVsIsSatellite = isSatellite;
      this.lastVsOpacity = opacity;
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
      const [r, g, b] = this.getViewshedColor(isSatellite);
      this.viewshedFanMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(r, g, b) },
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

    // uniforms 只在變更時更新
    if (this.lastVsIsSatellite !== isSatellite || this.lastVsOpacity !== opacity) {
      const [r, g, b] = this.getViewshedColor(isSatellite);
      (this.viewshedFanMat.uniforms["uColor"]!.value as THREE.Color).setRGB(r, g, b);
      this.viewshedFanMat.uniforms["uOpacity"]!.value = opacity;
      this.viewshedFanMat.blending = this.isDarkTheme ? THREE.AdditiveBlending : THREE.NormalBlending;
    }

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

      // 索引：只在首次或拓撲變更時建立
      if (!this.viewshedFanIndexBuilt) {
        const arcLen = sideRings[0]!.arc.length;
        const ring0Start = baseVert + 1;
        for (let s = 0; s < arcLen - 1; s++) {
          idx[iOff++] = baseVert;
          idx[iOff++] = ring0Start + s;
          idx[iOff++] = ring0Start + s + 1;
        }
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
    }

    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute("alpha") as THREE.BufferAttribute).needsUpdate = true;
    if (!this.viewshedFanIndexBuilt) {
      geo.getIndex()!.needsUpdate = true;
      geo.setDrawRange(0, iOff);
      this.viewshedFanIndexBuilt = true;
    }
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
      this.viewshedFanIndexBuilt = false;
    }
    this.lastVsIsSatellite = null;
    this.lastVsOpacity = -1;
  }

  dispose() {
    this.clearScene();
    this.clearViewshedLines();
    this.renderer.dispose();
  }
}
