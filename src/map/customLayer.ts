import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import mapboxgl from "mapbox-gl";
import * as THREE from "three";
import type { Flight, RenderMode } from "../types";
import { FlightScene } from "../three/FlightScene";
import { mercatorToGlobe, type GlobeResolved } from "../three/shaders/globeProject";
import { setAltExaggeration, getAltExaggeration, setAltOffset, getAltOffset } from "../utils/coordinates";
import { FlightTimeIndex } from "../utils/flightIndex";

/** ±12h 時間窗口（秒） */
const VISIBILITY_WINDOW_SEC = 12 * 3600;

/** Far View 像素密度實測用的 mercator 偏移量與 scratch（render 同步使用，模組級重用） */
const MEASURE_EPS = 1e-5;
const _measureMat = new THREE.Matrix4();
const _gpA: GlobeResolved = { x: 0, y: 0, z: 0, cull: 0, dot: 1 };
const _gpB: GlobeResolved = { x: 0, y: 0, z: 0, cull: 0, dot: 1 };

/** 用 render matrix（column-major）把兩個世界座標投影到螢幕，回傳像素距離 */
function screenDistPx(m: number[], a: GlobeResolved, b: GlobeResolved, w: number, h: number): number {
  const wa = m[3]! * a.x + m[7]! * a.y + m[11]! * a.z + m[15]!;
  const xa = (m[0]! * a.x + m[4]! * a.y + m[8]! * a.z + m[12]!) / wa;
  const ya = (m[1]! * a.x + m[5]! * a.y + m[9]! * a.z + m[13]!) / wa;
  const wb = m[3]! * b.x + m[7]! * b.y + m[11]! * b.z + m[15]!;
  const xb = (m[0]! * b.x + m[4]! * b.y + m[8]! * b.z + m[12]!) / wb;
  const yb = (m[1]! * b.x + m[5]! * b.y + m[9]! * b.z + m[13]!) / wb;
  return Math.hypot((xb - xa) * w * 0.5, (yb - ya) * h * 0.5);
}

export interface FlightLayerOptions {
  getCurrentTime: () => number;
  getFlights: () => Flight[];
  getRenderMode: () => RenderMode;
  getAltExaggeration: () => number;
  getAltOffset: () => number;
  getStaticOpacity: () => number;
  getStaticWidth: () => number;
  getGlowIntensity: () => number;
  getOrbScale: () => number;
  getFarView: () => boolean;
  getFarViewBoost: () => number;
  getIsDarkTheme: () => boolean;
  getShowTrails: () => boolean;
  getTimeWindow: () => boolean;
  getTrailDisplay: () => string;
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
  // ±12h 可見度掃描的 1 秒 bucket（事件化，避免每幀 O(N) 全掃）
  let lastScanBucket = NaN;
  // repaint 閘控狀態
  let lastRepaintTime = NaN;
  let lastControlSig = "";
  let keepAliveFrames = 0;
  const KEEP_ALIVE_FRAMES = 12; // 動作停止後的續繪窗，橋接 timeRef 落後一幀避免播放 stall
  // setGlobe 的 cam scratch，每幀重用避免物件字面量 alloc
  const camScratch = { x: 0, y: 0, z: 0 };

  return {
    id: "flight-3d",
    type: "custom" as const,
    renderingMode: "3d" as const,

    onAdd(mapInstance: MapboxMap, gl: WebGLRenderingContext) {
      map = mapInstance;
      flightScene.init(gl);
      opts.onSceneReady?.(flightScene);
    },

    render(_gl, matrix, projection, projectionToMercatorMatrix, projectionToMercatorTransition) {
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
        lastScanBucket = NaN;   // 新幾何：強制重掃可見集合
        timeIndex.build(flights);
        flightScene.invalidateMercatorCache();
      }

      // 靜態軌跡（用完整航班集合建構幾何體）
      flightScene.updateStaticTrails(flights, mode);

      // ±12h 靜態軌跡可見度（在 render loop 中計算，不經過 React）
      const timeWindow = opts.getTimeWindow();
      if (timeWindow) {
        // 事件化：可見集合只在時間跨過 1 秒 bucket 時重掃（sim-time ≤1s 落差，
        // ±12h 窗邊緣不可辨），取代每幀 O(N) 全量掃描 + Set 配置。
        const scanBucket = Math.floor(time);
        if (scanBucket !== lastScanBucket) {
          lastScanBucket = scanBucket;
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
        }
      } else if (lastVisibilityKey !== "all") {
        // 關閉時間窗口 → 全部可見
        lastVisibilityKey = "all";
        lastScanBucket = NaN; // 重新開啟 timeWindow 時強制重掃
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

      // Progressive 軌跡模式
      const trailDisplay = opts.getTrailDisplay();
      flightScene.setProgressiveMode(trailDisplay === "progressive");
      if (trailDisplay === "progressive") {
        flightScene.updateProgressiveVisibility(time);
      }

      const staticOpacity = opts.getStaticOpacity();
      const staticWidth = opts.getStaticWidth();
      const glowIntensity = opts.getGlowIntensity();
      const orbScale = opts.getOrbScale();
      // Far View 遠景增強：軌跡 alpha ×3；orb 補償在下方 isGlobe/transition 確定後實測計算
      const farView = opts.getFarView();
      const farViewBoost = opts.getFarViewBoost();
      flightScene.setStaticOpacity(Math.min(1, staticOpacity * (farView ? 3 : 1)));
      flightScene.setStaticWidth(staticWidth);
      flightScene.setGlowIntensity(glowIntensity);
      flightScene.setLimbFade(farView);

      // globe 貼球：Mapbox 每幀給 globe→mercator 矩陣 + 過渡係數（低 zoom 為球體）
      const isGlobe = projection?.name === "globe" && !!projectionToMercatorMatrix;
      const transition = projectionToMercatorTransition ?? 0;
      // cam 只在 globe 模式需要（背面剔除）；mercator 模式 setGlobe 會忽略，故跳過 fetch。
      // scratch 物件重用避免每幀 alloc（setGlobe 同步讀取，不保留參考）。
      let camArg: { x: number; y: number; z: number } | null = null;
      if (isGlobe) {
        const cam = map?.getFreeCameraOptions().position;
        if (cam) {
          camScratch.x = cam.x;
          camScratch.y = cam.y;
          camScratch.z = cam.z;
          camArg = camScratch;
        }
      }
      flightScene.setGlobe(isGlobe ? projectionToMercatorMatrix! : null, transition, camArg);

      // Far View orb 補償：orb 的 scale 是套在「貼球轉換後」的座標空間（InstancedOrbs
      // 對轉換後座標 set scale），所以像素密度必須在同一個空間量——把畫面中心轉換到
      // post-globe 空間後，直接在該空間偏移 eps 投影實測（x/y 各量一次取大者，避免
      // 偏移方向恰與視線平行）。對齊 z7 平面基準（512×2^7 = 65,536 px/unit）。
      let orbMul = 1;
      if (farView && map) {
        const mc = mapboxgl.MercatorCoordinate.fromLngLat(map.getCenter());
        const gMat = isGlobe ? _measureMat.fromArray(projectionToMercatorMatrix!) : null;
        mercatorToGlobe(mc.x, mc.y, 0, gMat, transition, null, _gpA);
        const canvas = map.getCanvas();
        const w = canvas.clientWidth || canvas.width;
        const h = canvas.clientHeight || canvas.height;
        _gpB.x = _gpA.x + MEASURE_EPS; _gpB.y = _gpA.y; _gpB.z = _gpA.z;
        const pxX = screenDistPx(matrix, _gpA, _gpB, w, h);
        _gpB.x = _gpA.x; _gpB.y = _gpA.y + MEASURE_EPS;
        const pxY = screenDistPx(matrix, _gpA, _gpB, w, h);
        const pxPerUnit = Math.max(pxX, pxY) / MEASURE_EPS;
        if (pxPerUnit > 1e-6) {
          orbMul = Math.min(64, Math.max(1, 65536 / pxPerUnit));
        }
        orbMul *= farViewBoost;
      }
      flightScene.setOrbScale(orbScale * orbMul);

      // 用時間索引取得活躍航班
      const activeFlights = timeIndex.getActiveFlights(time);
      flightScene.update(activeFlights, time);
      flightScene.render(matrix);

      // ── repaint 閘控 ─────────────────────────────────────────────
      // 只在「有東西在動」時續繪；相機移動 Mapbox 會自己重繪，不需我們觸發。
      // KEEP_ALIVE 續繪窗確保播放不因 timeRef 落後一幀而 stall。
      const timeChanged = time !== lastRepaintTime;
      lastRepaintTime = time;
      const transitioning = isGlobe && transition > 0 && transition < 1;
      // 控制項簽章：多數 slider/toggle 不觸發重建，靠這個在 loop 熱著時撿到變更
      const controlSig = `${isDark}|${altExag}|${altOff}|${showTrails}|${timeWindow}|${trailDisplay}|${staticOpacity}|${staticWidth}|${glowIntensity}|${orbScale}|${farView}|${farViewBoost}|${mode}|${flightsKey}`;
      const controlsChanged = controlSig !== lastControlSig;
      lastControlSig = controlSig;

      if (
        timeChanged ||                    // 播放中（動畫時鐘前進）
        transitioning ||                  // globe↔mercator 過渡中
        flightScene.isStaticBuilding() || // 靜態軌跡漸進建構中（buffer 待更新）
        flightScene.hasActiveOrbs() ||    // 有光球呼吸/閃爍動畫
        controlsChanged                   // 控制項剛變更
      ) {
        keepAliveFrames = KEEP_ALIVE_FRAMES;
      }
      if (keepAliveFrames > 0) {
        keepAliveFrames--;
        map?.triggerRepaint();
      }
    },

    onRemove() {
      flightScene.dispose();
    },
  };
}
