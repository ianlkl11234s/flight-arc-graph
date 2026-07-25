import * as THREE from "three";
import { mercatorToGlobe, type GlobeResolved } from "./shaders/globeProject";

const MAX_INSTANCES = 1024;
const _g: GlobeResolved = { x: 0, y: 0, z: 0, cull: 1, dot: 1 };

interface OrbLayer {
  mesh: THREE.InstancedMesh;
  baseOpacity: number;
  scaleRatio: number;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * InstancedMesh 光球管理器
 * 4 個 InstancedMesh 取代每架飛機 5 個獨立 Mesh
 * draw calls: 從 N×5 降到 4
 */
export class InstancedOrbs {
  private layers: OrbLayer[] = [];
  private blinkLayer!: OrbLayer;
  private geo: THREE.IcosahedronGeometry;
  private count = 0;
  private time = 0;
  /** 每個 instance 的 phase offset，避免同步呼吸/閃爍 */
  private phaseOffsets = new Float32Array(MAX_INSTANCES);
  /** 活躍 instance 的位置（用於點擊拾取） */
  private positions = new Float32Array(MAX_INSTANCES * 3);
  /** 活躍 instance 對應的 flight id */
  private flightIds: string[] = [];

  private orbScale = 0.000005;
  /** Per-instance scale multiplier（fr24_id → multiplier）；null = 全 1.0 */
  private scaleMap: Map<string, number> | null = null;

  /** 貼球參數（由 FlightScene.setGlobe 傳入）；globeToMerc=null → 平面 mercator */
  private globeToMerc: THREE.Matrix4 | null = null;
  private globeTransition = 1;
  private globeCam: THREE.Vector3 | null = null;

  constructor(scene: THREE.Scene, color: THREE.Color, blending: THREE.Blending) {
    this.geo = new THREE.IcosahedronGeometry(1, 2);

    // 預生成 phase offsets
    for (let i = 0; i < MAX_INSTANCES; i++) {
      this.phaseOffsets[i] = Math.random() * Math.PI * 2;
    }

    // Core (白色), Glow1 (主題色), Glow2 (主題色), Blink (紅色)
    const configs = [
      { scaleRatio: 0.5, opacity: 1.0, color: new THREE.Color(1, 1, 1) },
      { scaleRatio: 1.0, opacity: 0.5, color: color.clone() },
      { scaleRatio: 2.0, opacity: 0.15, color: color.clone() },
    ];

    for (const cfg of configs) {
      const mat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: cfg.opacity,
        blending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.InstancedMesh(this.geo, mat, MAX_INSTANCES);
      mesh.count = 0;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.layers.push({ mesh, baseOpacity: cfg.opacity, scaleRatio: cfg.scaleRatio });
    }

    // Blink layer（紅色閃爍，較低 detail）
    const blinkGeo = new THREE.IcosahedronGeometry(1, 1);
    const blinkMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.0, 0.1, 0.1),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const blinkMesh = new THREE.InstancedMesh(blinkGeo, blinkMat, MAX_INSTANCES);
    blinkMesh.count = 0;
    blinkMesh.frustumCulled = false;
    scene.add(blinkMesh);
    this.blinkLayer = { mesh: blinkMesh, baseOpacity: 1.0, scaleRatio: 0.4 };
  }

  /**
   * 批次更新所有活躍光球
   * @param entries - 活躍航班的 [id, x, y, z] 陣列
   */
  updateAll(entries: Array<{ id: string; x: number; y: number; z: number }>) {
    this.count = Math.min(entries.length, MAX_INSTANCES);
    this.flightIds.length = this.count;
    const dt = 0.016;
    this.time += dt;

    for (let i = 0; i < this.count; i++) {
      const e = entries[i]!;
      this.flightIds[i] = e.id;

      // 貼球：mercator → globe（含背面 cull）；平面模式直接回傳 mercator
      mercatorToGlobe(e.x, e.y, e.z, this.globeToMerc, this.globeTransition, this.globeCam, _g);
      const gx = _g.x, gy = _g.y, gz = _g.z;
      // 光球比 1px 軌跡線大得多，沿用軌跡的窄剔除帶（-0.08~0.02）會在球緣「戳出」輪廓外
      // → 光球改用寬淡出帶：與相機夾角 >70°（dot<0.35）開始縮小、~85°（0.08）歸零
      const limbFade = _g.dot >= 0.35 ? 1 : Math.max(0, (_g.dot - 0.08) / 0.27);
      const cull = Math.min(_g.cull, limbFade);
      // 存貼球後座標供點擊拾取（與渲染一致）
      this.positions[i * 3] = gx;
      this.positions[i * 3 + 1] = gy;
      this.positions[i * 3 + 2] = gz;

      const phase = this.phaseOffsets[i]!;

      // 呼吸動畫
      const pulse = 1.0 + Math.sin(this.time * 2.0 + phase) * 0.15;

      // Per-instance multiplier（按機型等分類調整大小，未設定則 1.0）
      const mul = this.scaleMap?.get(e.id) ?? 1.0;

      // Orb layers（cull：球體背面的光球縮到 0 隱藏）
      for (const layer of this.layers) {
        const s = this.orbScale * layer.scaleRatio * pulse * mul * cull;
        _dummy.position.set(gx, gy, gz);
        _dummy.scale.set(s, s, s);
        _dummy.updateMatrix();
        layer.mesh.setMatrixAt(i, _dummy.matrix);
      }

      // Blink layer
      const cycle = ((this.time + phase) * 1.2) % 1.0;
      const blink1 = cycle < 0.1 ? 1.0 : 0.0;
      const blink2 = cycle > 0.15 && cycle < 0.25 ? 0.7 : 0.0;
      const blinkOpacity = Math.max(blink1, blink2);

      const bs = this.orbScale * this.blinkLayer.scaleRatio * mul * cull;
      _dummy.position.set(gx, gy, gz);
      _dummy.scale.set(bs, bs, bs);
      _dummy.updateMatrix();
      this.blinkLayer.mesh.setMatrixAt(i, _dummy.matrix);

      // Per-instance blink color with alpha encoded in RGB intensity
      _color.setRGB(blinkOpacity, blinkOpacity * 0.1, blinkOpacity * 0.1);
      this.blinkLayer.mesh.setColorAt(i, _color);
    }

    // 更新 instance counts 和 matrix
    for (const layer of this.layers) {
      layer.mesh.count = this.count;
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
    this.blinkLayer.mesh.count = this.count;
    this.blinkLayer.mesh.instanceMatrix.needsUpdate = true;
    if (this.blinkLayer.mesh.instanceColor) {
      this.blinkLayer.mesh.instanceColor.needsUpdate = true;
    }
  }

  /** 設定光球大小（全域基準） */
  setScale(scale: number) {
    this.orbScale = scale;
  }

  /** 設定貼球參數（每幀由 FlightScene.setGlobe 傳入） */
  setGlobe(globeToMerc: THREE.Matrix4 | null, transition: number, cam: THREE.Vector3 | null) {
    this.globeToMerc = globeToMerc;
    this.globeTransition = transition;
    this.globeCam = cam;
  }

  /** 設定 per-instance scale multiplier；null = 還原為全 1.0 */
  setScaleMap(map: Map<string, number> | null) {
    this.scaleMap = map;
  }

  /** 切換主題 */
  setTheme(color: THREE.Color, blending: THREE.Blending) {
    for (let i = 0; i < this.layers.length; i++) {
      const mat = this.layers[i]!.mesh.material as THREE.MeshBasicMaterial;
      mat.blending = blending;
      if (i > 0) mat.color.copy(color);
      mat.needsUpdate = true;
    }
  }

  /**
   * 點擊拾取：螢幕座標 → 最近的 flightId
   */
  pickFlight(
    screenX: number, screenY: number,
    viewWidth: number, viewHeight: number,
    matrix: THREE.Matrix4,
  ): string | null {
    const threshold = 25;
    let closest: { id: string; dist: number } | null = null;
    const v = new THREE.Vector4();

    for (let i = 0; i < this.count; i++) {
      const ox = this.positions[i * 3]!;
      const oy = this.positions[i * 3 + 1]!;
      const oz = this.positions[i * 3 + 2]!;

      v.set(ox, oy, oz, 1.0).applyMatrix4(matrix);
      if (v.w <= 0) continue;

      const sx = ((v.x / v.w) * 0.5 + 0.5) * viewWidth;
      const sy = ((-v.y / v.w) * 0.5 + 0.5) * viewHeight;

      const dist = Math.hypot(sx - screenX, sy - screenY);
      if (dist < threshold && (!closest || dist < closest.dist)) {
        closest = { id: this.flightIds[i]!, dist };
      }
    }

    return closest?.id ?? null;
  }

  dispose() {
    for (const layer of this.layers) {
      (layer.mesh.material as THREE.Material).dispose();
      layer.mesh.dispose();
    }
    (this.blinkLayer.mesh.material as THREE.Material).dispose();
    this.blinkLayer.mesh.dispose();
    this.geo.dispose();
  }
}
