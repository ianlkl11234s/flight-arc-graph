import * as THREE from "three";
import type { TrailPoint } from "../types";
import { toMercator } from "../utils/coordinates";

import batchedVert from "./shaders/batchedTrail.vert?raw";
import batchedFrag from "./shaders/batchedTrail.frag?raw";

const MAX_SLOTS = 1024;
const POINTS_PER_SLOT = 64;
// LineSegments: 每段需要 2 個頂點
const VERTS_PER_SLOT = (POINTS_PER_SLOT - 1) * 2;
const TOTAL_VERTS = MAX_SLOTS * VERTS_PER_SLOT;

interface SlotState {
  active: boolean;
  vertCount: number;
}

/**
 * 批次光軌管理器
 * 單一 LineSegments mesh 容納所有活躍光軌
 * draw calls: 從 N 降到 1
 */
export class BatchedTrails {
  mesh: THREE.LineSegments;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private posAttr: THREE.BufferAttribute;
  private progAttr: THREE.BufferAttribute;
  private colorIdxAttr: THREE.BufferAttribute;

  private slots: SlotState[] = [];
  /** flightId → slot index */
  private slotMap = new Map<string, number>();
  /** 下一個可用 slot 的搜尋起點 */
  private nextFreeSlot = 0;
  /** slot 排序：活躍的排前面，用於 drawRange 連續 */
  private slotOrder: number[] = [];
  /** 反向映射：sorted position → actual slot */
  private slotToSorted: number[] = [];
  private sortedToSlot: number[] = [];

  constructor(colors: THREE.Color[], blending: THREE.Blending) {
    this.geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(TOTAL_VERTS * 3);
    const progress = new Float32Array(TOTAL_VERTS);
    const colorIndex = new Float32Array(TOTAL_VERTS);

    this.posAttr = new THREE.BufferAttribute(positions, 3);
    this.progAttr = new THREE.BufferAttribute(progress, 1);
    this.colorIdxAttr = new THREE.BufferAttribute(colorIndex, 1);

    this.geometry.setAttribute("position", this.posAttr);
    this.geometry.setAttribute("progress", this.progAttr);
    this.geometry.setAttribute("colorIndex", this.colorIdxAttr);
    this.geometry.setDrawRange(0, 0);

    const colorVecs = colors.map(c => new THREE.Vector3(c.r, c.g, c.b));
    // 補齊到 5 個
    while (colorVecs.length < 5) {
      colorVecs.push(colorVecs[colorVecs.length - 1]!.clone());
    }

    this.material = new THREE.ShaderMaterial({
      vertexShader: batchedVert,
      fragmentShader: batchedFrag,
      uniforms: {
        uColors: { value: colorVecs },
        uOpacity: { value: 0.8 },
      },
      transparent: true,
      blending,
      depthWrite: false,
    });

    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;

    // 初始化 slots
    for (let i = 0; i < MAX_SLOTS; i++) {
      this.slots.push({ active: false, vertCount: 0 });
      this.slotOrder.push(i);
      this.slotToSorted.push(i);
      this.sortedToSlot.push(i);
    }
  }

  /**
   * 更新一條光軌
   * @returns 分配的 colorIndex（用於視覺一致性）
   */
  updateTrail(flightId: string, trail: TrailPoint[], colorIdx: number): void {
    let slot = this.slotMap.get(flightId);
    if (slot === undefined) {
      slot = this.allocSlot(flightId);
      if (slot === -1) return; // 已滿
    }

    const count = Math.min(trail.length, POINTS_PER_SLOT);
    if (count < 2) {
      this.deactivateSlot(slot);
      return;
    }

    // 計算 segment 頂點（LineSegments 格式：每段 AB 各一個頂點）
    const segCount = count - 1;
    const vertCount = segCount * 2;
    const baseVert = slot * VERTS_PER_SLOT;

    const tStart = trail[0]![3];
    const tEnd = trail[count - 1]![3];
    const tRange = tEnd - tStart;

    for (let i = 0; i < segCount; i++) {
      const a = trail[i]!;
      const b = trail[i + 1]!;
      const ma = toMercator(a[0], a[1], a[2]);
      const mb = toMercator(b[0], b[1], b[2]);

      const vi = baseVert + i * 2;
      this.posAttr.setXYZ(vi, ma.x, ma.y, ma.z);
      this.posAttr.setXYZ(vi + 1, mb.x, mb.y, mb.z);

      const pa = tRange > 0 ? (a[3] - tStart) / tRange : 1;
      const pb = tRange > 0 ? (b[3] - tStart) / tRange : 1;
      this.progAttr.setX(vi, pa);
      this.progAttr.setX(vi + 1, pb);

      this.colorIdxAttr.setX(vi, colorIdx);
      this.colorIdxAttr.setX(vi + 1, colorIdx);
    }

    // 把剩餘頂點歸零（避免殘留）
    for (let i = vertCount; i < VERTS_PER_SLOT; i++) {
      const vi = baseVert + i;
      this.posAttr.setXYZ(vi, 0, 0, 0);
      this.progAttr.setX(vi, 0);
    }

    this.slots[slot]!.active = true;
    this.slots[slot]!.vertCount = vertCount;
  }

  /** 標記一組 flightId 以外的所有 slot 為不活躍 */
  deactivateExcept(activeIds: Set<string>) {
    for (const [id, slot] of this.slotMap) {
      if (!activeIds.has(id)) {
        this.deactivateSlot(slot);
        this.slotMap.delete(id);
      }
    }
  }

  /** 提交更新，更新 drawRange 和 needsUpdate */
  commit() {
    // 簡單方案：用所有活躍 slot 中最大的結束位置
    // 不做 slot 重排，因為 GPU 跳過空 slot 的開銷很低
    let maxVert = 0;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const s = this.slots[i]!;
      if (s.active && s.vertCount > 0) {
        const end = i * VERTS_PER_SLOT + s.vertCount;
        if (end > maxVert) maxVert = end;
      }
    }

    this.geometry.setDrawRange(0, maxVert);
    this.posAttr.needsUpdate = true;
    this.progAttr.needsUpdate = true;
    this.colorIdxAttr.needsUpdate = true;
  }

  setOpacity(opacity: number) {
    this.material.uniforms["uOpacity"]!.value = opacity;
  }

  setColors(colors: THREE.Color[]) {
    const vecs = colors.map(c => new THREE.Vector3(c.r, c.g, c.b));
    while (vecs.length < 5) vecs.push(vecs[vecs.length - 1]!.clone());
    this.material.uniforms["uColors"]!.value = vecs;
  }

  setBlending(blending: THREE.Blending) {
    this.material.blending = blending;
    this.material.needsUpdate = true;
  }

  private allocSlot(flightId: string): number {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const idx = (this.nextFreeSlot + i) % MAX_SLOTS;
      if (!this.slots[idx]!.active && !this.hasSlotOwner(idx)) {
        this.slotMap.set(flightId, idx);
        this.nextFreeSlot = (idx + 1) % MAX_SLOTS;
        return idx;
      }
    }
    return -1; // 全滿
  }

  private hasSlotOwner(slot: number): boolean {
    for (const s of this.slotMap.values()) {
      if (s === slot) return true;
    }
    return false;
  }

  private deactivateSlot(slot: number) {
    this.slots[slot]!.active = false;
    this.slots[slot]!.vertCount = 0;
    // 把該 slot 的頂點歸零
    const base = slot * VERTS_PER_SLOT;
    for (let i = 0; i < VERTS_PER_SLOT; i++) {
      this.posAttr.setXYZ(base + i, 0, 0, 0);
      this.progAttr.setX(base + i, 0);
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
