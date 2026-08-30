import * as THREE from "three";
import mapboxgl, { type CustomLayerInterface, type Map as MapboxMap } from "mapbox-gl";
import type { AirspaceFeature } from "../data/airspaceLoader";
import { loadAirspace } from "../data/airspaceLoader";
import {
  AIRSPACE_CATEGORIES,
  type AirspaceCategory,
  type AirspaceSettings,
} from "../types/airspace";

import vertSrc from "../three/shaders/airspaceAurora.vert?raw";
import fragSrc from "../three/shaders/airspaceAurora.frag?raw";

/** 分類 ID → shader uniform 索引（依 sortOrder 低到高） */
const CATEGORY_ORDER: AirspaceCategory[] = [...AIRSPACE_CATEGORIES]
  .sort((a, b) => a.sortOrder - b.sortOrder)
  .map((c) => c.id);

function categoryToIndex(cat: AirspaceCategory): number {
  return CATEGORY_ORDER.indexOf(cat);
}

export interface AirspaceLayerOptions {
  getSettings: () => AirspaceSettings;
  getIsDarkTheme: () => boolean;
}

/**
 * 建立空域極光 CustomLayer：
 *  - 側壁 mesh（ShaderMaterial，垂直漸層 + shimmer）
 *  - 頂邊 LineSegments（AdditiveBlending glow）
 *  - 底邊 LineSegments（淡化描邊）
 *
 * 整個空域集合合併為單一 geometry，per-vertex categoryId → shader 依 uniform 開關/配色。
 */
export function createAirspaceLayer(opts: AirspaceLayerOptions): CustomLayerInterface {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  let renderer: THREE.WebGLRenderer | null = null;
  let mapRef: MapboxMap | null = null;

  let wallMesh: THREE.Mesh | null = null;
  let wallMat: THREE.ShaderMaterial | null = null;
  let topLine: THREE.LineSegments | null = null;
  let topLineMat: THREE.ShaderMaterial | null = null;
  let bottomLine: THREE.LineSegments | null = null;
  let bottomLineMat: THREE.ShaderMaterial | null = null;
  const projectionMatrix = new THREE.Matrix4();

  let built = false;
  let building = false;
  let removed = false;

  const startTime = performance.now();

  function makeWallMaterial(): THREE.ShaderMaterial {
    const colors = CATEGORY_ORDER.map(() => new THREE.Color(1, 1, 1));
    const enabled = CATEGORY_ORDER.map(() => 0);
    return new THREE.ShaderMaterial({
      vertexShader: vertSrc,
      fragmentShader: fragSrc,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uColors: { value: colors },
        uEnabled: { value: enabled },
        uOpacity: { value: 0.35 },
        uHeightScale: { value: 1.8 },
        uEdgeGlow: { value: 0.8 },
        uTime: { value: 0 },
        uIsDark: { value: 1 },
      },
    });
  }

  // 底/頂邊線使用同一 shader，但配置成線條模式（edgeFactor 決定描邊強度）
  function makeLineMaterial(isTop: boolean): THREE.ShaderMaterial {
    const mat = makeWallMaterial();
    mat.blending = THREE.AdditiveBlending;
    mat.uniforms["uEdgeGlow"]!.value = isTop ? 1.6 : 0.6;
    return mat;
  }

  /**
   * 根據 AirspaceFeature 集合建構 merged geometry
   */
  function buildGeometry(features: AirspaceFeature[]) {
    if (features.length === 0) return;

    // 估算頂點數：每 feature 的環點數 × 2（底+頂）；邊 = N 個 quad = 2N 個 tri = 6N 個 tri 頂點
    let totalRingPoints = 0;
    const usableFeatures: AirspaceFeature[] = [];
    for (const f of features) {
      // 去重環尾（若尾 = 頭）
      const ring = f.ring;
      if (!ring || ring.length < 3) continue;
      const n = (ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1])
        ? ring.length - 1
        : ring.length;
      if (n < 3) continue;
      totalRingPoints += n;
      usableFeatures.push(f);
    }

    // 側壁：每環 N 點 → N 個 quad，每 quad 6 頂點（2 tri）
    const wallVertCount = totalRingPoints * 6;
    const wallPos = new Float32Array(wallVertCount * 3);
    const wallHeightRatio = new Float32Array(wallVertCount);
    const wallCategoryId = new Float32Array(wallVertCount);
    const wallEdgeFactor = new Float32Array(wallVertCount);

    // 頂邊 / 底邊線：每環 N 點 → N 條線段 = 2N 頂點
    const lineVertCount = totalRingPoints * 2;
    const topPos = new Float32Array(lineVertCount * 3);
    const topHeightRatio = new Float32Array(lineVertCount);
    const topCategoryId = new Float32Array(lineVertCount);
    const topEdgeFactor = new Float32Array(lineVertCount);

    const botPos = new Float32Array(lineVertCount * 3);
    const botHeightRatio = new Float32Array(lineVertCount);
    const botCategoryId = new Float32Array(lineVertCount);
    const botEdgeFactor = new Float32Array(lineVertCount);

    let wOff = 0, tOff = 0, bOff = 0;

    for (const f of usableFeatures) {
      const ring = f.ring;
      const n = (ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1])
        ? ring.length - 1
        : ring.length;

      const catIdx = categoryToIndex(f.category);
      if (catIdx < 0) continue;

      // 計算平均 lat（用於 meterInMercatorCoordinateUnits 基準）
      let avgLat = 0;
      for (let i = 0; i < n; i++) avgLat += ring[i]![1];
      avgLat /= n;
      const mPerMercLat = mapboxgl.MercatorCoordinate
        .fromLngLat([0, avgLat], 1).z; // 1 meter → mercator z

      const floorZ = f.floorM * mPerMercLat;
      const ceilZ = f.ceilingM * mPerMercLat;

      // 預計算每點的 mercator xy
      const mxs = new Float32Array(n);
      const mys = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const [lng, lat] = ring[i]!;
        const mc = mapboxgl.MercatorCoordinate.fromLngLat([lng, lat], 0);
        mxs[i] = mc.x;
        mys[i] = mc.y;
      }

      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = mxs[i]!, y0 = mys[i]!;
        const x1 = mxs[j]!, y1 = mys[j]!;

        // Quad: (i,bot), (j,bot), (j,top), (i,top)
        // Triangle 1: i_bot, j_bot, j_top
        // Triangle 2: i_bot, j_top, i_top
        const push = (x: number, y: number, z: number, hr: number, ef: number) => {
          wallPos[wOff * 3 + 0] = x;
          wallPos[wOff * 3 + 1] = y;
          wallPos[wOff * 3 + 2] = z;
          wallHeightRatio[wOff] = hr;
          wallCategoryId[wOff] = catIdx;
          wallEdgeFactor[wOff] = ef;
          wOff++;
        };

        push(x0, y0, floorZ, 0, 0);
        push(x1, y1, floorZ, 0, 0);
        push(x1, y1, ceilZ, 1, 1);

        push(x0, y0, floorZ, 0, 0);
        push(x1, y1, ceilZ, 1, 1);
        push(x0, y0, ceilZ, 1, 1);

        // 頂邊線段：(i_top, j_top)
        const pushLine = (arrPos: Float32Array, arrHR: Float32Array, arrCat: Float32Array, arrEF: Float32Array, offRef: { v: number },
                         x: number, y: number, z: number, hr: number, ef: number) => {
          const o = offRef.v;
          arrPos[o * 3 + 0] = x;
          arrPos[o * 3 + 1] = y;
          arrPos[o * 3 + 2] = z;
          arrHR[o] = hr;
          arrCat[o] = catIdx;
          arrEF[o] = ef;
          offRef.v = o + 1;
        };
        const tRef = { v: tOff };
        pushLine(topPos, topHeightRatio, topCategoryId, topEdgeFactor, tRef, x0, y0, ceilZ, 1, 1);
        pushLine(topPos, topHeightRatio, topCategoryId, topEdgeFactor, tRef, x1, y1, ceilZ, 1, 1);
        tOff = tRef.v;

        const bRef = { v: bOff };
        pushLine(botPos, botHeightRatio, botCategoryId, botEdgeFactor, bRef, x0, y0, floorZ, 0, 1);
        pushLine(botPos, botHeightRatio, botCategoryId, botEdgeFactor, bRef, x1, y1, floorZ, 0, 1);
        bOff = bRef.v;
      }
    }

    // 建立 wall mesh
    const wallGeo = new THREE.BufferGeometry();
    wallGeo.setAttribute("position", new THREE.BufferAttribute(wallPos.subarray(0, wOff * 3), 3));
    wallGeo.setAttribute("heightRatio", new THREE.BufferAttribute(wallHeightRatio.subarray(0, wOff), 1));
    wallGeo.setAttribute("categoryId", new THREE.BufferAttribute(wallCategoryId.subarray(0, wOff), 1));
    wallGeo.setAttribute("edgeFactor", new THREE.BufferAttribute(wallEdgeFactor.subarray(0, wOff), 1));
    wallMat = makeWallMaterial();
    wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.frustumCulled = false;
    scene.add(wallMesh);

    const topGeo = new THREE.BufferGeometry();
    topGeo.setAttribute("position", new THREE.BufferAttribute(topPos.subarray(0, tOff * 3), 3));
    topGeo.setAttribute("heightRatio", new THREE.BufferAttribute(topHeightRatio.subarray(0, tOff), 1));
    topGeo.setAttribute("categoryId", new THREE.BufferAttribute(topCategoryId.subarray(0, tOff), 1));
    topGeo.setAttribute("edgeFactor", new THREE.BufferAttribute(topEdgeFactor.subarray(0, tOff), 1));
    topLineMat = makeLineMaterial(true);
    topLine = new THREE.LineSegments(topGeo, topLineMat);
    topLine.frustumCulled = false;
    scene.add(topLine);

    const botGeo = new THREE.BufferGeometry();
    botGeo.setAttribute("position", new THREE.BufferAttribute(botPos.subarray(0, bOff * 3), 3));
    botGeo.setAttribute("heightRatio", new THREE.BufferAttribute(botHeightRatio.subarray(0, bOff), 1));
    botGeo.setAttribute("categoryId", new THREE.BufferAttribute(botCategoryId.subarray(0, bOff), 1));
    botGeo.setAttribute("edgeFactor", new THREE.BufferAttribute(botEdgeFactor.subarray(0, bOff), 1));
    bottomLineMat = makeLineMaterial(false);
    bottomLine = new THREE.LineSegments(botGeo, bottomLineMat);
    bottomLine.frustumCulled = false;
    scene.add(bottomLine);

    built = true;
  }

  function applyUniforms() {
    const settings = opts.getSettings();
    const isDark = opts.getIsDarkTheme();
    const mats = [wallMat, topLineMat, bottomLineMat].filter((m): m is THREE.ShaderMaterial => !!m);
    if (mats.length === 0) return;

    for (const mat of mats) {
      const colors = mat.uniforms["uColors"]!.value as THREE.Color[];
      const enabled = mat.uniforms["uEnabled"]!.value as number[];
      CATEGORY_ORDER.forEach((cat, idx) => {
        const conf = AIRSPACE_CATEGORIES.find((c) => c.id === cat)!;
        const [r, g, b] = isDark ? conf.colorDark : conf.colorLight;
        colors[idx]!.setRGB(r, g, b);
        enabled[idx] = settings.enabled && settings.visibility[cat] ? 1 : 0;
      });
      mat.uniforms["uOpacity"]!.value = settings.opacity;
      mat.uniforms["uHeightScale"]!.value = settings.heightScale;
      mat.uniforms["uIsDark"]!.value = isDark ? 1 : 0;
      mat.uniforms["uTime"]!.value = (performance.now() - startTime) / 1000;
      // wall 本身的 edge glow 較弱，頂線更強
      mat.blending = isDark ? THREE.AdditiveBlending : THREE.NormalBlending;
      mat.needsUpdate = false; // uniforms 不需重編譯
    }
    if (wallMat) wallMat.uniforms["uEdgeGlow"]!.value = settings.edgeGlow * 0.4;
    if (topLineMat) topLineMat.uniforms["uEdgeGlow"]!.value = settings.edgeGlow * 1.6;
    if (bottomLineMat) bottomLineMat.uniforms["uEdgeGlow"]!.value = settings.edgeGlow * 0.5;
  }

  return {
    id: "airspace-aurora",
    type: "custom" as const,
    renderingMode: "3d" as const,

    onAdd(map: MapboxMap, gl: WebGLRenderingContext) {
      removed = false;
      mapRef = map;
      renderer = new THREE.WebGLRenderer({
        canvas: gl.canvas as HTMLCanvasElement,
        context: gl as unknown as WebGL2RenderingContext,
        antialias: true,
      });
      renderer.autoClear = false;

      if (!built && !building) {
        building = true;
        loadAirspace()
          .then((features) => {
            if (removed) return;
            buildGeometry(features);
            applyUniforms();
            mapRef?.triggerRepaint();
          })
          .catch((err) => {
            console.error("[airspace] load failed", err);
          })
          .finally(() => { building = false; });
      }
    },

    render(_gl: WebGLRenderingContext, matrix: number[]) {
      if (!renderer) return;
      const settings = opts.getSettings();
      if (!settings.enabled || !built) return;
      const hasVisibleCategory = CATEGORY_ORDER.some((cat) => settings.visibility[cat]);
      const hasVisibleOutput = hasVisibleCategory && (settings.opacity > 0 || settings.edgeGlow > 0);
      if (!hasVisibleOutput) return;

      applyUniforms();

      camera.projectionMatrix = projectionMatrix.fromArray(matrix);
      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();

      // shimmer 需要持續重繪
      // 沒有可見分類或輸出透明度時不維持動畫 repaint；開啟狀態仍由上層的
      // control change / map interaction 觸發下一次 render。
      if (hasVisibleOutput) mapRef?.triggerRepaint();
    },

    onRemove() {
      removed = true;
      if (wallMesh) {
        scene.remove(wallMesh);
        wallMesh.geometry.dispose();
      }
      if (topLine) {
        scene.remove(topLine);
        topLine.geometry.dispose();
      }
      if (bottomLine) {
        scene.remove(bottomLine);
        bottomLine.geometry.dispose();
      }
      wallMat?.dispose();
      topLineMat?.dispose();
      bottomLineMat?.dispose();
      renderer = null;
      mapRef = null;
      built = false;
    },
  };
}
