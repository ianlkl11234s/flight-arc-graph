import * as THREE from "three";
import { toMercator } from "../utils/coordinates";

/**
 * 通用 Point bloom 場景 — 只吃 {lon, lat, colorHex, sizeNorm(0-1)}[]，不綁業務資料。
 *
 * 一支 Points draw call + 單 shader 疊 3 段 halo（core / mid / far）+ AdditiveBlending。
 * 相鄰點光暈疊加自然爆白，模仿 UnrealBloomPass 效果，零新依賴。
 *
 * 想 bloom 化任何 Point layer：轉成 GlowPoint[] 餵進來即可。
 * - 發電廠 → fuelColorOf(fuel_type) + capacity_mw normalize
 * - 機場總覽 → 流量 white→orange→red ramp + dailyProxy normalize
 * - 任何 POI 皆可套
 */

export interface GlowPoint {
  lon: number;
  lat: number;
  colorHex: string;
  /** 0~1 之間的相對大小，映射到 MIN..MAX_POINT_SIZE 像素 */
  sizeNorm: number;
}

const MAX_POINT_COUNT = 4096;
const MIN_POINT_SIZE = 24;
const MAX_POINT_SIZE = 128;

// Mapbox globe：球體半徑 = EXTENT / 2π（源碼 GLOBE_RADIUS，EXTENT=8192）
const GLOBE_RADIUS = 8192 / (2 * Math.PI);

/** lat/lng → Mapbox ECEF（球面座標，供 projectionToMercatorMatrix 貼球用；y 軸為負） */
function latLngToEcef(lat: number, lng: number): [number, number, number] {
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const cphi = Math.cos(phi);
  return [cphi * Math.sin(lam) * GLOBE_RADIUS, -Math.sin(phi) * GLOBE_RADIUS, cphi * Math.cos(lam) * GLOBE_RADIUS];
}

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute vec3 aEcef;       // Mapbox ECEF 球面座標
uniform float uPixelRatio;
uniform float uTime;
uniform float uZoomScale;   // 由 map.getZoom() 換算來，1.0 = 參考 zoom
uniform float uSizeMul;     // 使用者 slider，1.0 = 預設
uniform mat4 uGlobeToMerc;  // Mapbox projectionToMercatorMatrix（globe→mercator world）
uniform float uTransition;  // 0 = 球體、1 = 平面 mercator（z5-6 過渡）
uniform vec3 uCameraMerc;   // 相機位置（mercator），供背面剔除
varying vec3 vColor;
varying float vVis;         // 背面淡出係數
void main() {
  vColor = aColor;

  // globe：ECEF → mercator world，再與現有平面 mercator 座標依 transition 混合
  vec3 mercFromGlobe = (uGlobeToMerc * vec4(aEcef, 1.0)).xyz;
  vec3 world = mix(mercFromGlobe, position, uTransition);

  // 背面剔除：球體背面的點淡出（additive + depthTest:false 會透出來像地心鬼火）
  vec3 nrm = normalize(mat3(uGlobeToMerc) * aEcef);
  vec3 toCam = normalize(uCameraMerc - mercFromGlobe);
  float globeVis = smoothstep(-0.25, 0.05, dot(nrm, toCam));
  vVis = mix(globeVis, 1.0, uTransition);

  vec4 mvPos = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPos;
  float pulse = 0.9 + 0.1 * sin(uTime * 1.8 + position.x * 200.0);
  gl_PointSize = aSize * uPixelRatio * pulse * uZoomScale * uSizeMul;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uOpacity;
uniform float uCoreBoost;
varying vec3 vColor;
varying float vVis;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  if (d > 1.0) discard;
  float core = smoothstep(0.18, 0.0,  d);
  float mid  = smoothstep(0.55, 0.18, d) * 0.55;
  float far  = smoothstep(1.0,  0.55, d) * 0.22;
  float a = (core + mid + far) * uOpacity * vVis;
  vec3 col = mix(vColor, vec3(1.0), core * uCoreBoost);
  gl_FragColor = vec4(col, a);
}
`;

interface Instance {
  mc: { x: number; y: number; z: number };
  ecef: [number, number, number];
  color: THREE.Color;
  sizePx: number;
}

export interface GlowPointsSceneOptions {
  minSizePx?: number;
  maxSizePx?: number;
  /** 0-1，中心推向白色的力道，越大越像爆光 */
  coreBoost?: number;
}

export class GlowPointsScene {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private projMatrix = new THREE.Matrix4(); // render() 每幀重用，避免 new Matrix4
  private instances: Instance[] = [];
  private ownsRenderer = false;
  private startTime = performance.now();
  private minSize: number;
  private maxSize: number;
  private coreBoost: number;

  constructor(opts: GlowPointsSceneOptions = {}) {
    this.minSize = opts.minSizePx ?? MIN_POINT_SIZE;
    this.maxSize = opts.maxSizePx ?? MAX_POINT_SIZE;
    this.coreBoost = opts.coreBoost ?? 0.85;
  }

  init(glOrRenderer: WebGLRenderingContext | THREE.WebGLRenderer) {
    if (glOrRenderer instanceof THREE.WebGLRenderer) {
      this.renderer = glOrRenderer;
      this.ownsRenderer = false;
    } else {
      this.renderer = new THREE.WebGLRenderer({
        canvas: glOrRenderer.canvas as HTMLCanvasElement,
        context: glOrRenderer as unknown as WebGL2RenderingContext,
        antialias: true,
      });
      this.renderer.autoClear = false;
      this.ownsRenderer = true;
    }
    this.buildMesh();
  }

  private buildMesh() {
    this.disposeMesh();
    this.geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_POINT_COUNT * 3);
    const col = new Float32Array(MAX_POINT_COUNT * 3);
    const size = new Float32Array(MAX_POINT_COUNT);
    const ecef = new Float32Array(MAX_POINT_COUNT * 3);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    this.geometry.setAttribute("aEcef", new THREE.BufferAttribute(ecef, 3));
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uOpacity: { value: 0.9 },
        uTime: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uCoreBoost: { value: this.coreBoost },
        uZoomScale: { value: 1 },
        uSizeMul: { value: 1 },
        uGlobeToMerc: { value: new THREE.Matrix4() },
        uTransition: { value: 1 },
        uCameraMerc: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  setData(rows: GlowPoint[]) {
    if (!this.geometry) return;
    const filtered = rows.filter(
      (r) => Number.isFinite(r.lon) && Number.isFinite(r.lat),
    );
    this.instances = filtered.slice(0, MAX_POINT_COUNT).map((r) => {
      const mc = toMercator(r.lat, r.lon, 0);
      const norm = Math.max(0, Math.min(1, r.sizeNorm));
      const sizePx = this.minSize + (this.maxSize - this.minSize) * norm;
      return {
        mc,
        ecef: latLngToEcef(r.lat, r.lon),
        color: new THREE.Color(r.colorHex),
        sizePx,
      };
    });

    const posAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute("aColor") as THREE.BufferAttribute;
    const sizeAttr = this.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    const ecefAttr = this.geometry.getAttribute("aEcef") as THREE.BufferAttribute;

    for (let i = 0; i < this.instances.length; i++) {
      const p = this.instances[i]!;
      posAttr.setXYZ(i, p.mc.x, p.mc.y, p.mc.z);
      colAttr.setXYZ(i, p.color.r, p.color.g, p.color.b);
      sizeAttr.setX(i, p.sizePx);
      ecefAttr.setXYZ(i, p.ecef[0], p.ecef[1], p.ecef[2]);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    ecefAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, this.instances.length);
  }

  setOpacity(o: number) {
    if (!this.material) return;
    this.material.uniforms.uOpacity!.value = Math.max(0, Math.min(1, o));
  }

  /** Mapbox zoom → 光暈縮放（zoom < REF 縮小、> REF 放大） */
  setZoom(zoom: number, referenceZoom = 10) {
    if (!this.material) return;
    // zoom 每 -1 光暈 ×0.6，zoom 每 +1 光暈 ×1.4；clamp 避免極端
    const raw = Math.pow(1.5, zoom - referenceZoom);
    this.material.uniforms.uZoomScale!.value = Math.max(0.15, Math.min(3.5, raw));
  }

  setSizeMul(m: number) {
    if (!this.material) return;
    this.material.uniforms.uSizeMul!.value = Math.max(0.1, Math.min(5, m));
  }

  setCoreBoost(b: number) {
    if (!this.material) return;
    this.coreBoost = Math.max(0, Math.min(1, b));
    this.material.uniforms.uCoreBoost!.value = this.coreBoost;
  }

  /**
   * 設定 globe 貼球參數（每幀由 custom layer 傳入 Mapbox 給的值）。
   * @param globeToMerc Mapbox projectionToMercatorMatrix；null = mercator 模式（不貼球）
   * @param transition 0=球體、1=平面（Mapbox projectionToMercatorTransition）
   */
  setGlobe(globeToMerc: number[] | null, transition: number) {
    if (!this.material) return;
    const m = this.material.uniforms.uGlobeToMerc!.value as THREE.Matrix4;
    if (globeToMerc && globeToMerc.length >= 16) {
      m.fromArray(globeToMerc);
      this.material.uniforms.uTransition!.value = Math.max(0, Math.min(1, transition));
    } else {
      m.identity();
      this.material.uniforms.uTransition!.value = 1; // 無 globe 資料 → 純 mercator
    }
  }

  /** 設定相機位置（mercator 座標），供 shader 背面剔除 */
  setCamera(x: number, y: number, z: number) {
    if (!this.material) return;
    (this.material.uniforms.uCameraMerc!.value as THREE.Vector3).set(x, y, z);
  }

  setVisible(v: boolean) {
    if (this.points) this.points.visible = v;
  }

  render(matrix: number[]): boolean {
    if (!this.material) return false;
    const gl = this.renderer.getContext();
    const blendEnabled = gl.isEnabled(gl.BLEND);
    const blendSrc = gl.getParameter(gl.BLEND_SRC_RGB);
    const blendDst = gl.getParameter(gl.BLEND_DST_RGB);
    const blendSrcA = gl.getParameter(gl.BLEND_SRC_ALPHA);
    const blendDstA = gl.getParameter(gl.BLEND_DST_ALPHA);

    this.camera.projectionMatrix = this.projMatrix.fromArray(matrix);
    this.material.uniforms.uTime!.value = (performance.now() - this.startTime) / 1000;

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.renderer.resetState();

    if (blendEnabled) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.blendFuncSeparate(blendSrc, blendDst, blendSrcA, blendDstA);

    return true;
  }

  private disposeMesh() {
    if (this.points) {
      this.scene.remove(this.points);
      this.points = null;
    }
    if (this.geometry) {
      this.geometry.dispose();
      this.geometry = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
  }

  dispose() {
    this.disposeMesh();
    if (this.ownsRenderer) this.renderer?.dispose();
  }
}
