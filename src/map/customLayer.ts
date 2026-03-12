import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import type { Flight, RenderMode } from "../types";
import { FlightScene } from "../three/FlightScene";
import { setAltExaggeration, getAltExaggeration, setAltOffset, getAltOffset } from "../utils/coordinates";
import { FlightTimeIndex } from "../utils/flightIndex";

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

      // 主題變更 → 更新顏色 + 重建靜態軌跡
      if (isDark !== lastDarkTheme) {
        lastDarkTheme = isDark;
        flightScene.setTheme(isDark);
      }

      // 高度參數變更 → 更新座標模組 + 清除快取 + 強制重建靜態軌跡
      setAltExaggeration(altExag);
      setAltOffset(altOff);
      if (altExag !== lastAltExag || altOff !== lastAltOffset) {
        lastAltExag = altExag;
        lastAltOffset = altOff;
        flightScene.invalidateMercatorCache();
        flightScene.forceRebuildStatic();
      }

      // 航班集合變動時重建時間索引 + 靜態軌跡
      const flightsKey = flights.length === 0
        ? ""
        : `${flights.length}|${flights[0]!.fr24_id}|${flights[flights.length - 1]!.fr24_id}`;
      if (flightsKey !== lastFlightsKey) {
        lastFlightsKey = flightsKey;
        timeIndex.build(flights);
        flightScene.invalidateMercatorCache();
      }

      // 靜態軌跡（日期篩選是離散的，flights 只在使用者操作時改變）
      flightScene.updateStaticTrails(flights, mode);

      // showTrails 切換
      const showTrails = opts.getShowTrails();
      if (showTrails !== lastShowTrails) {
        lastShowTrails = showTrails;
        flightScene.setShowTrails(showTrails);
      }

      // 再套用不透明度 & 光球大小
      flightScene.setStaticOpacity(opts.getStaticOpacity());
      flightScene.setOrbScale(opts.getOrbScale());

      // 用時間索引取得活躍航班，避免全量遍歷
      const activeFlights = timeIndex.getActiveFlights(time);
      flightScene.update(activeFlights, time);
      flightScene.render(matrix);

      // 請求持續重繪（動畫）
      map?.triggerRepaint();
    },

    onRemove() {
      flightScene.dispose();
    },
  };
}
