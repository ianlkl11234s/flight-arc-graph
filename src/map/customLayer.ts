import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import type { Flight, RenderMode } from "../types";
import { FlightScene } from "../three/FlightScene";
import { setAltExaggeration, getAltExaggeration, setAltOffset, getAltOffset } from "../utils/coordinates";
import { FlightTimeIndex } from "../utils/flightIndex";

/** ±12h 時間窗口（秒） */
const VISIBILITY_WINDOW_SEC = 12 * 3600;

export interface FlightLayerOptions {
  getCurrentTime: () => number;
  getFlights: () => Flight[];
  getRenderMode: () => RenderMode;
  getAltExaggeration: () => number;
  getAltOffset: () => number;
  getStaticOpacity: () => number;
  getOrbScale: () => number;
  getIsDarkTheme: () => boolean;
  getShowTrails: () => boolean;
  getTimeWindow: () => boolean;
  onSceneReady?: (scene: FlightScene) => void;
}

/**
 * 建立 Mapbox CustomLayer，橋接 Three.js 場景
 */
export function createFlightLayer(opts: FlightLayerOptions): CustomLayerInterface {
  const flightScene = new FlightScene();
  const timeIndex = new FlightTimeIndex();
  let map: MapboxMap | null = null;
  let lastAltExag = getAltExaggeration();
  let lastAltOffset = getAltOffset();
  let lastDarkTheme = true;
  let lastShowTrails = true;
  let lastFlightsKey = "";
  let lastVisibilityKey = "";

  return {
    id: "flight-3d",
    type: "custom" as const,
    renderingMode: "3d" as const,

    onAdd(mapInstance: MapboxMap, gl: WebGLRenderingContext) {
      map = mapInstance;
      flightScene.init(gl);
      opts.onSceneReady?.(flightScene);
    },

    render(_gl: WebGLRenderingContext, matrix: number[]) {
      const flights = opts.getFlights();
      const time = opts.getCurrentTime();
      const mode = opts.getRenderMode();
      const altExag = opts.getAltExaggeration();
      const altOff = opts.getAltOffset();
      const isDark = opts.getIsDarkTheme();

      // 主題變更
      if (isDark !== lastDarkTheme) {
        lastDarkTheme = isDark;
        flightScene.setTheme(isDark);
      }

      // 高度參數變更
      setAltExaggeration(altExag);
      setAltOffset(altOff);
      if (altExag !== lastAltExag || altOff !== lastAltOffset) {
        lastAltExag = altExag;
        lastAltOffset = altOff;
        flightScene.invalidateMercatorCache();
        flightScene.forceRebuildStatic();
      }

      // 航班集合變動時重建時間索引
      const flightsKey = flights.length === 0
        ? ""
        : `${flights.length}|${flights[0]!.fr24_id}|${flights[flights.length - 1]!.fr24_id}`;
      if (flightsKey !== lastFlightsKey) {
        lastFlightsKey = flightsKey;
        lastVisibilityKey = ""; // 強制重新計算可見度
        timeIndex.build(flights);
        flightScene.invalidateMercatorCache();
      }

      // 靜態軌跡（用完整航班集合建構幾何體）
      flightScene.updateStaticTrails(flights, mode);

      // ±12h 靜態軌跡可見度（在 render loop 中計算，不經過 React）
      const timeWindow = opts.getTimeWindow();
      if (timeWindow) {
        const tMin = time - VISIBILITY_WINDOW_SEC;
        const tMax = time + VISIBILITY_WINDOW_SEC;
        const visibleIds = new Set<string>();
        for (const f of flights) {
          if (f.path.length === 0) continue;
          const pathStart = f.path[0]![3];
          const pathEnd = f.path[f.path.length - 1]![3];
          if (pathEnd >= tMin && pathStart <= tMax) {
            visibleIds.add(f.fr24_id);
          }
        }
        const visKey = `${visibleIds.size}`;
        if (visKey !== lastVisibilityKey) {
          lastVisibilityKey = visKey;
          flightScene.updateStaticVisibility(visibleIds);
        }
      } else if (lastVisibilityKey !== "all") {
        // 關閉時間窗口 → 全部可見
        lastVisibilityKey = "all";
        const allIds = new Set<string>();
        for (const f of flights) allIds.add(f.fr24_id);
        flightScene.updateStaticVisibility(allIds);
      }

      // showTrails 切換
      const showTrails = opts.getShowTrails();
      if (showTrails !== lastShowTrails) {
        lastShowTrails = showTrails;
        flightScene.setShowTrails(showTrails);
      }

      flightScene.setStaticOpacity(opts.getStaticOpacity());
      flightScene.setOrbScale(opts.getOrbScale());

      // 用時間索引取得活躍航班
      const activeFlights = timeIndex.getActiveFlights(time);
      flightScene.update(activeFlights, time);
      flightScene.render(matrix);

      map?.triggerRepaint();
    },

    onRemove() {
      flightScene.dispose();
    },
  };
}
