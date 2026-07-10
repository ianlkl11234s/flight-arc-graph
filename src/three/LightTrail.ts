import * as THREE from "three";
import type { TrailPoint } from "../types";
import { toMercator } from "../utils/coordinates";

import trailVert from "./shaders/trail.vert?raw";
import trailFrag from "./shaders/trail.frag?raw";
import { GLOBE_PROJECT_GLSL } from "./shaders/globeProject";

/** 貼球共用 uniform（跨材質共用同一組 value 物件，每幀由 FlightScene 更新一次） */
export interface GlobeUniforms {
  uGlobeToMerc: { value: THREE.Matrix4 };
  uTransition: { value: number };
  uCameraEcef: { value: THREE.Vector3 };
}

/**
 * 光軌：漸層透明的彗尾效果
 * 使用自訂 shader 實現從尾端到前端的 alpha 漸變
 */
export class LightTrail {
  mesh: THREE.Line;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private maxPoints: number;

  constructor(
    color: THREE.Color = new THREE.Color(0.4, 0.7, 1.0),
    maxPoints = 512,
    blending: THREE.Blending = THREE.AdditiveBlending,
    globeUniforms?: GlobeUniforms,
  ) {
    this.maxPoints = maxPoints;

    this.geometry = new THREE.BufferGeometry();
    // 預分配 buffer
    const positions = new Float32Array(maxPoints * 3);
    const progress = new Float32Array(maxPoints);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("progress", new THREE.BufferAttribute(progress, 1));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.ShaderMaterial({
      vertexShader: GLOBE_PROJECT_GLSL + trailVert,
      fragmentShader: trailFrag,
      uniforms: {
        uColor: { value: color },
        uOpacity: { value: 0.8 },
        ...(globeUniforms ?? {
          uGlobeToMerc: { value: new THREE.Matrix4() },
          uTransition: { value: 1 },
          uCameraEcef: { value: new THREE.Vector3() },
        }),
      },
      transparent: true,
      blending,
      depthWrite: false,
      depthTest: false, // globe 底圖 depth（far=∞）會誤遮貼球航跡，故關閉；背面靠 shader cull 藏
    });

    this.mesh = new THREE.Line(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /** 更新軌跡點（原始座標，每點呼叫 toMercator） */
  updateTrail(trail: TrailPoint[]) {
    const count = Math.min(trail.length, this.maxPoints);
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const posAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const progAttr = this.geometry.getAttribute("progress") as THREE.BufferAttribute;

    const tStart = trail[0]![3];
    const tEnd = trail[count - 1]![3];
    const tRange = tEnd - tStart;

    for (let i = 0; i < count; i++) {
      const pt = trail[i]!;
      const mc = toMercator(pt[0], pt[1], pt[2]);
      posAttr.setXYZ(i, mc.x, mc.y, mc.z);
      progAttr.setX(i, tRange > 0 ? (pt[3] - tStart) / tRange : 1);
    }

    posAttr.needsUpdate = true;
    progAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }

  /**
   * 更新軌跡點（預計算 Mercator 座標版本）
   * 跳過逐點 toMercator，直接寫入快取的座標。
   * @param points - [mx, my, mz, timestamp] 陣列
   */
  updateTrailMercator(points: [number, number, number, number][]) {
    const count = Math.min(points.length, this.maxPoints);
    if (count < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }

    const posArr = (this.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const progArr = (this.geometry.getAttribute("progress") as THREE.BufferAttribute).array as Float32Array;

    const tStart = points[0]![3];
    const tEnd = points[count - 1]![3];
    const tRange = tEnd - tStart;

    for (let i = 0; i < count; i++) {
      const pt = points[i]!;
      const i3 = i * 3;
      posArr[i3] = pt[0];
      posArr[i3 + 1] = pt[1];
      posArr[i3 + 2] = pt[2];
      progArr[i] = tRange > 0 ? (pt[3] - tStart) / tRange : 1;
    }

    const posAttr = this.geometry.getAttribute("position") as THREE.BufferAttribute;
    const progAttr = this.geometry.getAttribute("progress") as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    progAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, count);
  }

  setColor(color: THREE.Color) {
    this.material.uniforms["uColor"]!.value = color;
  }

  setOpacity(opacity: number) {
    this.material.uniforms["uOpacity"]!.value = opacity;
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
