import * as THREE from "three";
import { GLOBE_PROJECT_GLSL, mercatorToEcef } from "./shaders/globeProject";

import trailVert from "./shaders/trail.vert?raw";
import trailFrag from "./shaders/trail.frag?raw";

/** 貼球共用 uniform（跨材質共用同一組 value 物件，每幀由 FlightScene 更新一次） */
export interface GlobeUniforms {
  uGlobeToMerc: { value: THREE.Matrix4 };
  uTransition: { value: number };
  uCameraEcef: { value: THREE.Vector3 };
}

/** 預計算的 Mercator 座標點：[mx, my, mz, timestamp] */
type MercPoint = readonly [number, number, number, number];

/** 光軌時間窗（秒）—— 同舊 getTrailUpToTime(path, time, 600) 的語意 */
const TRAIL_DURATION_SEC = 600;

/** 每 slot 實點上限。視窗 600s / FR24 密集取樣 ~5s ≈ 120 點；LOD 資料 ≤40 點 */
const SLOT_POINTS = 128;
/** 每 slot 頂點數：實點 + 頭尾各一個 opacity=0 的 guard（隔開 line strip 相鄰 slot） */
const SLOT_VERTS = SLOT_POINTS + 2;
/** 每頂點 GPU 記憶體：position(12B) + progress(4B) + aColor(12B) + aOpacity(4B) + aEcef(12B) */
const BYTES_PER_VERT = 44;
/**
 * slot 數下限：即使資料集同時在空中的峰值很小（如單機場 S1 ~105 架），也保留這個基本容量，
 * 避免資料集稍微變動（航班數 ±幾架）就在下限附近反覆觸發 ensureCapacity() 重建。
 */
const MIN_SLOTS = 1024;
/**
 * slot 數上限：記憶體保護。16384 × 130 頂點 × 44B/頂點 ≈ 93 MB GPU buffer。
 * 尖峰並發超過此值時 ensureCapacity() 會截斷並 console.warn（同舊「池滿互踢」行為，只是踢的機率變低）。
 */
const SLOT_CAP = 16384;
/** ensureCapacity() 的餘裕係數：抓資料尖峰的估計值可能略低於實際峰值，留 5% 緩衝避免剛好卡在門檻互踢 */
const CAPACITY_HEADROOM = 1.05;

interface SlotState {
  flightId: string;
  /** 航班路徑最後時間戳（逐出策略：踢最接近抵達者） */
  endTime: number;
  /** 上一幀寫入的實點數（縮短時要把多出來的舊頂點 opacity 歸零） */
  lastCount: number;
}

/**
 * 批次光軌管理器：所有動畫光軌合併成單一 THREE.Line（line strip）。
 *
 * - 每條 trail 佔一個固定 slot（SLOT_VERTS 頂點）；slot 之間以 opacity=0 的 guard
 *   頂點隔開（guard 與相鄰實點同座標 → 零長度段 + 跨 slot 橋接段兩端 opacity 0 → 不可見）。
 * - draw call 恆為 1；上傳用 addUpdateRange 只傳本幀髒 slot 的連續區段
 *   （freeSlots 低位優先配置，活躍 slot 聚集在 buffer 前端）。
 * - 顏色/不透明度為 per-vertex attribute（彗尾漸層數學與單條版 shader 完全一致）。
 * - 視窗切片邏輯移植自 utils/interpolation.getTrailUpToTime（頭尾插值語意相同），
 *   直接吃 FlightScene 快取的 mercator path + ECEF —— 每幀三角函數只剩頭尾 2 個插值點。
 */
export class BatchedTrails {
  mesh: THREE.Line;
  private geometry!: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private posAttr!: THREE.BufferAttribute;
  private progAttr!: THREE.BufferAttribute;
  private colorAttr!: THREE.BufferAttribute;
  private opacityAttr!: THREE.BufferAttribute;
  private ecefAttr!: THREE.BufferAttribute;
  private positions!: Float32Array;
  private progress!: Float32Array;
  private colors!: Float32Array;
  private opacities!: Float32Array;
  private ecefs!: Float32Array;

  /** 目前配置的 slot 數（動態，見 ensureCapacity）；buildBuffers() 統一設定 */
  private capacity = 0;
  /** 累積逐出次數（slot 池滿後互踢的次數）；驗收/除錯用，rebuild 時歸零 */
  private evictionCount = 0;

  private states!: (SlotState | null)[];
  private slotByFlight = new Map<string, number>();
  /** 空 slot 池（降冪排列，pop() 取最低 index → 活躍 slot 聚集低位，上傳區段緊湊） */
  private freeSlots: number[] = [];
  /** 歷史最高使用 slot（drawRange 上限；低於此的空 slot opacity 全 0，頂點成本可忽略） */
  private maxEverUsed = -1;

  // ── 逐出用 min-heap（endTime 最小者優先）─────────────────────────
  // 活躍航班數 > capacity 時，池滿後每幀有大量 flight 搶不到 slot，
  // 逐出候選須從全部佔用中找 endTime 最小者。原本用 for..of 掃過整個 slotByFlight
  // （最壞情況 O(capacity)，實測 world 規模達 ~11M 次迭代/幀，是 writeTrail 成本
  // 的 ~92%）；改用 min-heap 把「找最小 + 移除」壓到 O(log capacity)。
  // - slotSeq[slot]：目前佔用該 slot 的 acquire 序號，兼作 (a) heap 陳舊 entry 判斷
  //   （slot 被別的航班重新佔用後，舊 entry 的 seq 對不上 → 懶惰丟棄）與 (b) endTime
  //   完全打平手時的 tie-break —— 複製原本「Map 迭代序、strict < 不覆蓋」的語意，即
  //   「同 endTime 時踢最早取得目前 slot 的那個」，保證與原演算法逐出結果逐幀一致
  //   （實測 endTime 打平手比例 ~28%，FR24 時間戳量化所致，不能忽略）。
  private slotSeq!: Float64Array;
  private acquireSeq = 0;
  private heap: { endTime: number; slot: number; seq: number }[] = [];
  // 本幀髒區（slot 粒度），commit 時合併成單一 updateRange
  private minDirtySlot = Infinity;
  private maxDirtySlot = -1;

  constructor(globeUniforms: GlobeUniforms, blending: THREE.Blending) {
    this.geometry = this.buildBuffers(MIN_SLOTS);

    this.material = new THREE.ShaderMaterial({
      vertexShader: GLOBE_PROJECT_GLSL + trailVert,
      fragmentShader: trailFrag,
      uniforms: { ...globeUniforms },
      transparent: true,
      blending,
      depthWrite: false,
      depthTest: false, // globe 底圖 depth（far=∞）會誤遮貼球線，故關閉；背面靠 shader cull 藏
    });

    this.mesh = new THREE.Line(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // 靜態軌跡桶 mesh 建立時間晚於本 mesh（object id 較大）；renderOrder=1 維持
    // 「動畫光軌畫在靜態軌跡之後」的既有順序（light theme NormalBlending 順序有感）
    this.mesh.renderOrder = 1;
  }

  /**
   * （重）配置 slot buffer：typed array + THREE.BufferAttribute + 所有 slot 狀態全部重來。
   * 供 constructor 首次配置與 ensureCapacity() 重建共用。
   */
  private buildBuffers(capacity: number): THREE.BufferGeometry {
    this.capacity = capacity;
    const totalVerts = capacity * SLOT_VERTS;
    this.positions = new Float32Array(totalVerts * 3);
    this.progress = new Float32Array(totalVerts);
    this.colors = new Float32Array(totalVerts * 3);
    this.opacities = new Float32Array(totalVerts); // 初始全 0 → 全部不可見
    this.ecefs = new Float32Array(totalVerts * 3);

    this.posAttr = new THREE.BufferAttribute(this.positions, 3);
    this.progAttr = new THREE.BufferAttribute(this.progress, 1);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 3);
    this.opacityAttr = new THREE.BufferAttribute(this.opacities, 1);
    this.ecefAttr = new THREE.BufferAttribute(this.ecefs, 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.posAttr);
    geometry.setAttribute("progress", this.progAttr);
    geometry.setAttribute("aColor", this.colorAttr);
    geometry.setAttribute("aOpacity", this.opacityAttr);
    geometry.setAttribute("aEcef", this.ecefAttr);
    geometry.setDrawRange(0, 0);

    // slot 狀態全部重置：舊 buffer 裡的軌跡本來就跟著舊 typed array 一起丟棄，
    // 下一幀 update() 會用當下的 activeFlights 重新 writeTrail，同一批飛機立即補回。
    this.states = new Array(capacity).fill(null);
    this.slotByFlight = new Map<string, number>();
    this.freeSlots = [];
    for (let i = capacity - 1; i >= 0; i--) this.freeSlots.push(i);
    this.maxEverUsed = -1;
    this.slotSeq = new Float64Array(capacity);
    this.acquireSeq = 0;
    this.heap = [];
    this.evictionCount = 0;
    this.minDirtySlot = Infinity;
    this.maxDirtySlot = -1;

    return geometry;
  }

  /**
   * 依「這份資料同時在空中的峰值」（不含 headroom，FlightScene.updateTrailCapacity 算出）
   * 動態調整 slot 容量：clamp(peak × 1.05, MIN_SLOTS, SLOT_CAP)。
   *
   * 只在「需求超過目前容量」或「需求遠小於目前容量（<一半）」時才真的重建 buffer，
   * 避免同一資料集內的微幅波動（幾架飛機進出）反覆觸發重配。重建有一次性成本
   * （當幀所有 slot 內容清空，下一幀由 update() 用目前 activeFlights 重寫），
   * 所以只在真正需要時才做——切機場/region/日期（資料集 reference 變）才會呼叫本方法。
   */
  ensureCapacity(peakConcurrent: number): void {
    const rawTarget = Math.ceil(Math.max(0, peakConcurrent) * CAPACITY_HEADROOM);
    const target = Math.max(MIN_SLOTS, Math.min(rawTarget, SLOT_CAP));
    if (rawTarget > SLOT_CAP) {
      console.warn(
        `[BatchedTrails] 尖峰同時在空中數 ${peakConcurrent}（含 headroom ${rawTarget}）超過 slot 上限 ${SLOT_CAP}，已截斷；超額航班會互踢。`,
      );
    }
    if (target <= this.capacity && target * 2 >= this.capacity) return; // 容量夠用且沒有過度浪費，不重建
    const oldGeometry = this.geometry;
    this.geometry = this.buildBuffers(target);
    this.mesh.geometry = this.geometry;
    oldGeometry.dispose();
  }

  /** 目前配置的 slot 數；驗收/除錯用 */
  getCapacity(): number {
    return this.capacity;
  }

  /** 目前 GPU buffer 估算大小（bytes）：capacity × SLOT_VERTS × BYTES_PER_VERT；驗收/除錯用 */
  getBufferBytes(): number {
    return this.capacity * SLOT_VERTS * BYTES_PER_VERT;
  }

  /** 累積逐出次數（slot 池滿後互踢的次數）；驗收/除錯用 */
  getEvictionCount(): number {
    return this.evictionCount;
  }

  /**
   * 寫入一條光軌（含 slot 配置/逐出、時間窗切片、頭尾插值）。
   * @param pts  快取的 mercator path（[mx,my,mz,t]，t 遞增）
   * @param ecef 快取的 per-point ECEF（3 floats/點，與 pts 對齊）
   * @param headOut 軌跡頭部座標（光球位置），寫入成功時填入
   * @returns true = 已寫入（≥2 點）；false = 點數不足（slot 維持上一幀內容，同舊行為）
   */
  writeTrail(
    flightId: string,
    endTime: number,
    pts: MercPoint[],
    ecef: Float32Array,
    time: number,
    color: THREE.Color,
    opacity: number,
    headOut: { x: number; y: number; z: number },
  ): boolean {
    const n = pts.length;
    if (n === 0) return false;

    // ── 時間窗切片（同 getTrailUpToTime 語意）────────────────────
    const cutoff = time - TRAIL_DURATION_SEC;
    // startIdx = 第一個 t >= cutoff（binary search，取代原線性掃描，結果相同）
    let lo = 0, hi = n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (pts[m]![3] < cutoff) lo = m + 1;
      else hi = m;
    }
    let startIdx = lo;
    // endIdx = 最後一個 t <= time
    lo = startIdx; hi = n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (pts[m]![3] <= time) lo = m + 1;
      else hi = m;
    }
    const endIdx = lo - 1;

    let hasTail = startIdx > 0 && startIdx < n; // 尾端插值：cutoff 落在兩點之間
    const origCount = Math.max(0, endIdx - startIdx + 1);
    const lastT = origCount > 0 ? pts[endIdx]![3] : (hasTail ? cutoff : -Infinity);
    const hasHead = (hasTail || origCount > 0) && time > lastT; // 頭端插值：當前精確位置
    let count = (hasTail ? 1 : 0) + origCount + (hasHead ? 1 : 0);
    if (count < 2) return false;

    // 超出 slot 容量：丟最舊的點（尾端 progress→0 幾乎透明，肉眼不可辨）
    let overflow = count - SLOT_POINTS;
    if (overflow > 0) {
      if (hasTail) { hasTail = false; overflow--; }
      startIdx += overflow;
      count = SLOT_POINTS;
    }

    // ── slot 配置 ────────────────────────────────────────────────
    let slot = this.slotByFlight.get(flightId);
    if (slot === undefined) {
      slot = this.acquireSlot(flightId, endTime);
      if (slot === -1) return false; // 理論上不會（逐出後必有空位）
    }
    const state = this.states[slot]!;

    // ── 寫入頂點 ────────────────────────────────────────────────
    const t0 = hasTail ? cutoff : pts[startIdx]![3];
    const tEnd = hasHead ? time : pts[endIdx]![3];
    const tRange = tEnd - t0;
    const inv = tRange > 0 ? 1 / tRange : 0;
    const cr = color.r, cg = color.g, cb = color.b;
    const base = slot * SLOT_VERTS;

    let v = base + 1; // [base] 是 leading guard，最後補
    if (hasTail) {
      const a = pts[startIdx - 1]!, b = pts[startIdx]!;
      const r = (cutoff - a[3]) / (b[3] - a[3]);
      const x = a[0] + (b[0] - a[0]) * r;
      const y = a[1] + (b[1] - a[1]) * r;
      const z = a[2] + (b[2] - a[2]) * r;
      this.writeVert(v, x, y, z, tRange > 0 ? 0 : 1, cr, cg, cb, opacity);
      mercatorToEcef(x, y, z, this.ecefs, v * 3); // 插值點：唯二需要三角函數的地方之一
      v++;
    }
    for (let i = startIdx; i <= endIdx; i++) {
      const p = pts[i]!;
      this.writeVert(v, p[0], p[1], p[2], tRange > 0 ? (p[3] - t0) * inv : 1, cr, cg, cb, opacity);
      // ECEF 直接抄快取（零三角函數）
      const s3 = i * 3, d3 = v * 3;
      this.ecefs[d3] = ecef[s3]!;
      this.ecefs[d3 + 1] = ecef[s3 + 1]!;
      this.ecefs[d3 + 2] = ecef[s3 + 2]!;
      v++;
    }
    if (hasHead) {
      let x: number, y: number, z: number;
      if (endIdx < n - 1) {
        const a = pts[endIdx]!, b = pts[endIdx + 1]!;
        const r = (time - a[3]) / (b[3] - a[3]);
        x = a[0] + (b[0] - a[0]) * r;
        y = a[1] + (b[1] - a[1]) * r;
        z = a[2] + (b[2] - a[2]) * r;
      } else {
        // time 超出路徑末端：夾在最後一點（同 interpolatePosition 的 clamp 行為）
        const p = pts[n - 1]!;
        x = p[0]; y = p[1]; z = p[2];
      }
      this.writeVert(v, x, y, z, 1, cr, cg, cb, opacity);
      mercatorToEcef(x, y, z, this.ecefs, v * 3);
      v++;
    }

    // guard 頂點：與相鄰實點同座標、opacity 0（零長度段 + 橋接段不可見）
    const first3 = (base + 1) * 3;
    const last = v - 1, last3 = last * 3;
    this.copyVertPos(base, first3);
    this.opacities[base] = 0;
    this.copyVertPos(v, last3);
    this.opacities[v] = 0;

    // trail 縮短：舊的多餘實點 opacity 歸零（位置殘留無妨，不可見）
    for (let k = count + 2; k <= state.lastCount + 1; k++) {
      this.opacities[base + k] = 0;
    }
    state.lastCount = count;

    this.markDirty(slot);
    headOut.x = this.positions[last3]!;
    headOut.y = this.positions[last3 + 1]!;
    headOut.z = this.positions[last3 + 2]!;
    return true;
  }

  private writeVert(
    v: number, x: number, y: number, z: number,
    prog: number, r: number, g: number, b: number, opacity: number,
  ) {
    const v3 = v * 3;
    this.positions[v3] = x;
    this.positions[v3 + 1] = y;
    this.positions[v3 + 2] = z;
    this.progress[v] = prog;
    this.colors[v3] = r;
    this.colors[v3 + 1] = g;
    this.colors[v3 + 2] = b;
    this.opacities[v] = opacity;
  }

  /** guard 用：把 src3（float offset）的 position/ecef 複製到頂點 v */
  private copyVertPos(v: number, src3: number) {
    const d3 = v * 3;
    this.positions[d3] = this.positions[src3]!;
    this.positions[d3 + 1] = this.positions[src3 + 1]!;
    this.positions[d3 + 2] = this.positions[src3 + 2]!;
    this.ecefs[d3] = this.ecefs[src3]!;
    this.ecefs[d3 + 1] = this.ecefs[src3 + 1]!;
    this.ecefs[d3 + 2] = this.ecefs[src3 + 2]!;
  }

  /** 釋放不在 activeIds 中的 slot（航班落地/離開時間窗 → 立即隱藏，同舊 setOpacity(0)） */
  releaseMissing(activeIds: Set<string>) {
    for (const [id, slot] of this.slotByFlight) {
      if (!activeIds.has(id)) this.release(id, slot);
    }
  }

  private release(flightId: string, slot: number) {
    const state = this.states[slot];
    if (state) {
      const base = slot * SLOT_VERTS;
      for (let k = 0; k <= state.lastCount + 1; k++) this.opacities[base + k] = 0;
      this.markDirty(slot);
    }
    this.states[slot] = null;
    this.slotByFlight.delete(flightId);
    // 降冪排序插回（維持低位優先配置）
    let lo = 0, hi = this.freeSlots.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.freeSlots[m]! > slot) lo = m + 1;
      else hi = m;
    }
    this.freeSlots.splice(lo, 0, slot);
  }

  private acquireSlot(flightId: string, endTime: number): number {
    // 陳舊 entry（slot 被重新佔用後留下的舊 heap 記錄）太多時整批重建，保持記憶體有界。
    // 放在池滿判斷之外：池從不滿的場景（S1/S2）heap 只會單調成長（release 不會移除舊 entry），
    // 沒有這行同樣會無界累積，只是速度較慢。
    if (this.heap.length > this.capacity * 8) this.rebuildHeap();
    if (this.freeSlots.length === 0) {
      // 池滿：踢「最接近抵達」的航班（本來就快落地消失，視覺衝擊最小）。
      // O(log n) min-heap 取代原本掃全表的線性搜尋，逐出結果（含打平手 tie-break）與原演算法相同。
      let victimSlot = -1;
      let top = this.heapPopMin();
      while (top) {
        if (top.seq === this.slotSeq[top.slot]) { victimSlot = top.slot; break; } // 仍是目前佔用者，命中
        top = this.heapPopMin(); // 陳舊 entry（slot 早已換人佔用），丟棄繼續找
      }
      if (victimSlot === -1) return -1;
      const victimId = this.states[victimSlot]!.flightId;
      this.release(victimId, victimSlot);
      this.evictionCount++; // 驗收/除錯用計數器；不影響逐出邏輯本身
    }
    const slot = this.freeSlots.pop()!;
    this.states[slot] = { flightId, endTime, lastCount: 0 };
    this.slotByFlight.set(flightId, slot);
    if (slot > this.maxEverUsed) this.maxEverUsed = slot;
    const seq = ++this.acquireSeq;
    this.slotSeq[slot] = seq;
    this.heapPush({ endTime, slot, seq });
    return slot;
  }

  // ── min-heap 基本操作（陣列表示，endTime 升冪；打平手比 seq 升冪）───────
  private heapLess(a: { endTime: number; seq: number }, b: { endTime: number; seq: number }): boolean {
    return a.endTime < b.endTime || (a.endTime === b.endTime && a.seq < b.seq);
  }

  private heapPush(entry: { endTime: number; slot: number; seq: number }) {
    const h = this.heap;
    h.push(entry);
    let i = h.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.heapLess(entry, h[parent]!)) break;
      h[i] = h[parent]!;
      i = parent;
    }
    h[i] = entry;
  }

  private heapPopMin(): { endTime: number; slot: number; seq: number } | undefined {
    const h = this.heap;
    if (h.length === 0) return undefined;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      this.heapSiftDown(0);
    }
    return top;
  }

  private heapSiftDown(i: number) {
    const h = this.heap;
    const n = h.length;
    const entry = h[i]!;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let smallest = i, smallestEntry = entry;
      if (l < n && this.heapLess(h[l]!, smallestEntry)) { smallest = l; smallestEntry = h[l]!; }
      if (r < n && this.heapLess(h[r]!, smallestEntry)) { smallest = r; smallestEntry = h[r]!; }
      if (smallest === i) break;
      h[i] = smallestEntry;
      i = smallest;
    }
    h[i] = entry;
  }

  /** heap 累積過多陳舊 entry 時整批重建（只留目前仍佔用中的 slot），保持記憶體有界 */
  private rebuildHeap() {
    this.heap.length = 0;
    for (const slot of this.slotByFlight.values()) {
      this.heap.push({ endTime: this.states[slot]!.endTime, slot, seq: this.slotSeq[slot]! });
    }
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) this.heapSiftDown(i);
  }

  private markDirty(slot: number) {
    if (slot < this.minDirtySlot) this.minDirtySlot = slot;
    if (slot > this.maxDirtySlot) this.maxDirtySlot = slot;
  }

  /** 每幀一次：合併髒區為單一 updateRange 上傳 + 更新 drawRange */
  commit() {
    if (this.maxDirtySlot < 0) return;
    const startV = this.minDirtySlot * SLOT_VERTS;
    const countV = (this.maxDirtySlot + 1) * SLOT_VERTS - startV;

    this.applyRange(this.posAttr, startV, countV, 3);
    this.applyRange(this.progAttr, startV, countV, 1);
    this.applyRange(this.colorAttr, startV, countV, 3);
    this.applyRange(this.opacityAttr, startV, countV, 1);
    this.applyRange(this.ecefAttr, startV, countV, 3);

    this.geometry.setDrawRange(0, (this.maxEverUsed + 1) * SLOT_VERTS);
    this.minDirtySlot = Infinity;
    this.maxDirtySlot = -1;
  }

  private applyRange(attr: THREE.BufferAttribute, startV: number, countV: number, itemSize: number) {
    attr.clearUpdateRanges();
    attr.addUpdateRange(startV * itemSize, countV * itemSize);
    attr.needsUpdate = true;
  }

  setBlending(blending: THREE.Blending) {
    this.material.blending = blending;
    this.material.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
