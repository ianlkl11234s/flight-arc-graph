import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import { GlowPointsScene, type GlowPoint } from "../three/GlowPointsScene";

/** 顏色維度：流量（白→橘→紅）或 資料完整度（4 級離散） */
export type AtlasColorMode = "flow" | "completeness";

export const ATLAS_GLOW_LAYER_ID = "atlas-glow-3d";

/** 完整度離散色 — 與 circle 版（MapView）、popup（App.ATLAS_STATUS_META）、legend 同步 */
const STATUS_COLORS: Record<string, string> = {
  complete: "#2ecc71",
  "core-partial": "#f1c40f",
  partial: "#4a90d9",
  planned: "#8894a3",
};

/**
 * 流量色階：白 → 橘 → 紅（吃 sqrt 正規化後的 t∈[0,1]）
 * t=0 白（低流量）、t=0.5 橘（中）、t=1 紅（高流量樞紐）。
 */
function flowRamp(t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const white = [255, 255, 255];
  const orange = [255, 140, 26];
  const red = [255, 30, 30];
  const lerp = (a: number[], b: number[], m: number) =>
    a.map((v, i) => Math.round(v + (b[i]! - v) * m));
  const c = k < 0.5 ? lerp(white, orange, k / 0.5) : lerp(orange, red, (k - 0.5) / 0.5);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface AtlasFeature {
  geometry: { type: string; coordinates: [number, number] };
  properties: { dailyProxy?: number; status?: string };
}

function featuresToGlow(
  feats: AtlasFeature[],
  mode: AtlasColorMode,
  dailyMax: number,
): GlowPoint[] {
  return feats
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => {
      const [lon, lat] = f.geometry.coordinates;
      const daily = f.properties.dailyProxy ?? 1;
      // sqrt 壓縮右偏分布：大小與流量顏色共用同一個 t
      const t = Math.sqrt(Math.max(daily, 1) / dailyMax);
      const colorHex =
        mode === "flow" ? flowRamp(t) : STATUS_COLORS[f.properties.status ?? ""] ?? "#888888";
      return { lon, lat, colorHex, sizeNorm: t };
    });
}

export interface AtlasGlowLayerOptions {
  getIsVisible: () => boolean;
  getColorMode: () => AtlasColorMode;
  /** 星點大小倍率（使用者滑桿），1 = 預設。省略則固定 1。 */
  getSizeMul?: () => number;
  /** geojson 路徑，預設同 circle 版 */
  dataUrl?: string;
}

/**
 * Mapbox CustomLayer：把機場總覽畫成夜空中發光的 bloom 星點。
 * 大小＝流量（sqrt(dailyProxy)）、顏色＝流量色階(白橘紅) 或 完整度離散色（可切換）。
 * 自行 fetch airport-points.geojson，與 circle 版共存不干涉。
 */
export function createAtlasGlowLayer(opts: AtlasGlowLayerOptions): CustomLayerInterface {
  const scene = new GlowPointsScene({ minSizePx: 12, maxSizePx: 110, coreBoost: 0.7 });
  let map: MapboxMap | null = null;
  let features: AtlasFeature[] | null = null;
  let dailyMax = 1;
  let lastMode: AtlasColorMode | null = null;

  return {
    id: ATLAS_GLOW_LAYER_ID,
    type: "custom" as const,
    renderingMode: "3d" as const,

    onAdd(mapInstance, gl) {
      map = mapInstance;
      scene.init(gl);
      fetch(opts.dataUrl ?? "./airport-points.geojson")
        .then((r) => r.json())
        .then((geo: { features: AtlasFeature[] }) => {
          features = geo.features;
          dailyMax = features.reduce((m, f) => Math.max(m, f.properties.dailyProxy ?? 0), 1);
          lastMode = null; // 迫使下一幀 setData
          map?.triggerRepaint();
        })
        .catch((e) => console.error("[AtlasGlow] load failed", e));
    },

    render(_gl, matrix, projection, projectionToMercatorMatrix, projectionToMercatorTransition) {
      const visible = opts.getIsVisible();
      scene.setVisible(visible);
      if (!visible || !features) return;

      const mode = opts.getColorMode();
      if (mode !== lastMode) {
        lastMode = mode;
        scene.setData(featuresToGlow(features, mode, dailyMax));
      }
      scene.setSizeMul(opts.getSizeMul?.() ?? 1);
      if (map) scene.setZoom(map.getZoom());

      // globe 貼球：Mapbox 每幀給 globe→mercator 矩陣 + 過渡係數（低 zoom 為球體）
      const isGlobe = projection?.name === "globe" && !!projectionToMercatorMatrix;
      scene.setGlobe(
        isGlobe ? projectionToMercatorMatrix! : null,
        projectionToMercatorTransition ?? 0,
      );
      if (map) {
        const cam = map.getFreeCameraOptions().position;
        if (cam) scene.setCamera(cam.x, cam.y, cam.z);
      }

      const moving = scene.render(matrix);
      if (moving) map?.triggerRepaint();
    },

    onRemove() {
      scene.dispose();
    },
  };
}
