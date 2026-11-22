/**
 * 平面方位投影模式的地圖端：切 Mapbox 到 mercator、藏掉所有真實經緯度的圖層、
 * 自畫底圖（陸地／海岸線／經緯網／距離圈／目的地標籤）。投影數學在 planeProjection.ts。
 *
 * 進入後畫面上只剩：
 * - flight-3d custom layer（軌跡、光球；座標經 toMercator() 換算）
 * - plane-* 圖層（本檔產生，資料是投影後反解的「假經緯度」）
 * - 底圖的 background 層
 *
 * 其餘圖層（Mapbox 底圖、機場框、原生 2D 軌跡、Atlas 點、晨昏線、空域極光…）都還在
 * 真實經緯度上，一律隱藏。模式期間別的程式仍會改它們的 visibility 或新增圖層，所以在
 * 這個 map 實例上包住 setLayoutProperty／addLayer：想顯示的先記下來、離開時才還原。
 */
import type { Map as MbMap, GeoJSONSource, LayerSpecification, CameraOptions } from "mapbox-gl";
import {
  createPlaneProjector,
  greatCircleKm,
  mercatorToLngLat,
  projectLine,
  projectPolygons,
  rangeRing,
  rimRing,
  type PlaneKind,
  type PlaneMorph,
  type PlanePoint,
  type PlaneProjector,
  type PlaneRadial,
} from "./planeProjection";
import { setPlaneProjection } from "../utils/coordinates";
import { notifyActivity } from "./repaintScheduler";
import { PLANE_BASEMAP_COLORS } from "../types/dataColors";

/** 圓盤上要標名字的機場（目的地／出發地） */
export interface PlaneLabel {
  lat: number;
  lng: number;
  /** 顯示代碼（IATA，沒有就 ICAO） */
  code: string;
  /** 排序權重（班次數）；標籤互相擋到時留權重大的 */
  weight: number;
}

/** 使用者可調的底圖選項（設定面板） */
export interface PlaneOptions {
  /** 海岸線＋經緯網＋陸地填色的亮度 0–1 */
  basemapOpacity: number;
  /** 距離圈間距（公里） */
  ringStepKm: number;
  /** 陸地填色 */
  landFill: boolean;
  /** 目的地標籤 */
  destLabels: boolean;
}

export const DEFAULT_PLANE_OPTIONS: PlaneOptions = {
  basemapOpacity: 1,
  ringStepKm: 2000,
  landFill: true,
  destLabels: true,
};

export const PLANE_RING_STEPS = [1000, 2000, 5000] as const;

export interface PlaneModeConfig {
  kind: PlaneKind;
  /** 投影中心（緯度、經度） */
  lat: number;
  lng: number;
  /** 中心點標籤（機場 ICAO） */
  label: string;
  options: PlaneOptions;
  /** 主要目的地（已依權重排序） */
  destinations: readonly PlaneLabel[];
}

const PREFIX = "plane-";
const KEEP_VISIBLE = new Set(["flight-3d"]);
const FLIGHT_LAYER = "flight-3d";
const LAND_URL = "./basemap/ne_50m_land.json";
const RING_MAX_KM = 20000;
const LABEL_FONT = ["DIN Pro Medium", "Arial Unicode MS Regular"];
/** 展開動畫長度（毫秒）；呼叫端要同步移動鏡頭時用 */
export const PLANE_MORPH_MS = 1400;
/** 動畫中用的粗海岸線：每 N 點取一點（每幀都要重投影＋重灌 GeoJSON） */
const COARSE_EVERY = 6;

const SRC = {
  land: "plane-land",
  grat: "plane-grat",
  coast: "plane-coast",
  rings: "plane-rings",
  labels: "plane-labels",
} as const;
const LYR = {
  land: "plane-land-fill",
  grat: "plane-grat-line",
  coast: "plane-coast-line",
  rings: "plane-rings-line",
  ringLabel: "plane-ring-label",
  destDot: "plane-dest-dot",
  destLabel: "plane-dest-label",
  center: "plane-center-dot",
  centerLabel: "plane-center-label",
} as const;

type Visibility = "visible" | "none";
interface State {
  /** 各圖層「離開模式後應該是什麼」 */
  wanted: Map<string, Visibility>;
  origSetLayoutProperty: MbMap["setLayoutProperty"];
  origAddLayer: MbMap["addLayer"];
  cfg: PlaneModeConfig | null;
  /** 陸地／海岸線是照哪個投影算的（kind|lat|lng）；沒變就不重算 */
  landKey: string;
  /** 非同步工作（陸地資料載入）的序號；過期的結果丟掉 */
  seq: number;
  /** 進行中的展開動畫（rAF id） */
  anim: number | null;
}
const states = new WeakMap<MbMap, State>();

// ── 陸地資料 ─────────────────────────────────────────────────

interface LandData {
  /** 每個多邊形 = [外環, 洞…]；環 = [lng, lat, …] */
  polygons: number[][][];
  /** 動畫用：抽稀後的環（折線） */
  coarse: [number, number][][];
}
let land: LandData | null = null;
let landPromise: Promise<LandData> | null = null;
function loadLand(): Promise<LandData> {
  if (land) return Promise.resolve(land);
  landPromise ??= fetch(LAND_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`land ${r.status}`);
      return r.json() as Promise<{ polygons: number[][][] }>;
    })
    .then((j) => {
      const coarse: [number, number][][] = [];
      for (const poly of j.polygons) {
        for (const ring of poly) {
          const n = ring.length / 2;
          if (n < COARSE_EVERY * 3) continue; // 小島在動畫中省略
          const line: [number, number][] = [];
          for (let i = 0; i < n; i += COARSE_EVERY) line.push([ring[i * 2]!, ring[i * 2 + 1]!]);
          line.push([ring[0]!, ring[1]!]);
          coarse.push(line);
        }
      }
      return (land = { polygons: j.polygons, coarse });
    })
    .catch((err) => {
      landPromise = null; // 下次進入再試
      throw err;
    });
  return landPromise;
}

export function isPlaneModeActive(map: MbMap): boolean {
  return states.has(map);
}

// ── 藏掉真實經緯度圖層 ───────────────────────────────────────

function shouldHide(id: string, type: string | undefined): boolean {
  return type !== "background" && !id.startsWith(PREFIX) && !KEEP_VISIBLE.has(id);
}

/** 所有圖層 id（含 custom layer；map.getStyle() 的序列化會略過 custom，只能讀內部 _order） */
function allLayers(map: MbMap): { id: string; type: string | undefined }[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (map as any).style as { _order?: string[]; _layers?: Record<string, { type?: string }> } | undefined;
  if (!style?._order || !style._layers) return [];
  return style._order.map((id) => ({ id, type: style._layers![id]?.type }));
}

function hideRealWorldLayers(map: MbMap, st: State) {
  for (const { id, type } of allLayers(map)) {
    if (!shouldHide(id, type)) continue;
    const cur = (map.getLayoutProperty(id, "visibility") ?? "visible") as Visibility;
    if (cur !== "none") {
      st.wanted.set(id, "visible");
      st.origSetLayoutProperty.call(map, id, "visibility", "none");
    } else if (!st.wanted.has(id)) {
      st.wanted.set(id, "none");
    }
  }
}

function installGuards(map: MbMap, st: State) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = map as any;
  m.setLayoutProperty = function (id: string, name: string, value: unknown, ...rest: unknown[]) {
    if (name === "visibility" && shouldHide(id, map.getLayer(id)?.type)) {
      st.wanted.set(id, value === "none" ? "none" : "visible");
      return map;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (st.origSetLayoutProperty as any).call(map, id, name, value, ...rest);
  };
  m.addLayer = function (layer: { id: string; type?: string; layout?: { visibility?: Visibility } }, before?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = (st.origAddLayer as any).call(map, layer, before);
    if (shouldHide(layer.id, layer.type)) {
      const v = layer.layout?.visibility ?? "visible";
      st.wanted.set(layer.id, v);
      if (v !== "none") st.origSetLayoutProperty.call(map, layer.id, "visibility", "none");
    }
    return r;
  };
}

function removeGuards(map: MbMap) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = map as any;
  delete m.setLayoutProperty; // 拿掉實例上的覆寫，回到 prototype 的原方法
  delete m.addLayer;
}

// ── 自畫底圖：資料 ───────────────────────────────────────────

type FC = GeoJSON.FeatureCollection;
const EMPTY: FC = { type: "FeatureCollection", features: [] };

function lines(coords: [number, number][][], props: Record<string, unknown> = {}): GeoJSON.Feature {
  return { type: "Feature", properties: props, geometry: { type: "MultiLineString", coordinates: coords } };
}

function graticule(proj: PlaneProjector): FC {
  const parts: [number, number][][] = [];
  for (let lng = -180; lng < 180; lng += 30) {
    parts.push(...projectLine(proj, [[lng, -88], [lng, 88]], 2));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const line: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 5) line.push([lng, lat]);
    parts.push(...projectLine(proj, line, 2));
  }
  return { type: "FeatureCollection", features: [lines(parts)] };
}

/** 主圈（線較亮）：間距 2,000 時每 10,000 km；其餘每 5,000 km */
function isMajorRing(km: number, step: number): boolean {
  return km % (step === 2000 ? 10000 : 5000) === 0;
}

function rings(proj: PlaneProjector, step: number): { lines: FC; labels: GeoJSON.Feature[] } {
  const features: GeoJSON.Feature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const pt: PlanePoint = { x: 0, y: 0 };
  for (let km = step; km <= RING_MAX_KM; km += step) {
    const ring = rangeRing(proj.lat0, proj.lng0, km, 2);
    const parts = projectLine(proj, ring, 2);
    if (parts.length === 0) continue;
    const major = isMajorRing(km, step);
    features.push(lines(parts, { major }));
    // 標籤放在方位 135°（東南）那一點；互相擋到時主圈優先
    const at = ring[Math.round((135 / 360) * (ring.length - 1))]!;
    if (proj.project(at[1], at[0], pt)) {
      labels.push({
        type: "Feature",
        properties: { kind: "ring", text: `${km.toLocaleString("en-US")} km`, sort: major ? 0 : 1 },
        geometry: { type: "Point", coordinates: mercatorToLngLat(pt.x, pt.y) },
      });
    }
  }
  features.push(lines([rimRing(proj)], { rim: true }));
  return { lines: { type: "FeatureCollection", features }, labels };
}

function destinationLabels(proj: PlaneProjector, cfg: PlaneModeConfig): GeoJSON.Feature[] {
  if (!cfg.options.destLabels) return [];
  const pt: PlanePoint = { x: 0, y: 0 };
  const out: GeoJSON.Feature[] = [];
  cfg.destinations.forEach((d, i) => {
    if (!proj.project(d.lat, d.lng, pt)) return; // 超出投影範圍（日晷 75° 外）
    const km = Math.round(greatCircleKm(cfg.lat, cfg.lng, d.lat, d.lng) / 10) * 10;
    out.push({
      type: "Feature",
      properties: { kind: "dest", code: d.code, dist: `${km.toLocaleString("en-US")} km`, sort: i },
      geometry: { type: "Point", coordinates: mercatorToLngLat(pt.x, pt.y) },
    });
  });
  return out;
}

function setData(map: MbMap, id: string, data: FC) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

/** 便宜的部分：經緯網、距離圈、標籤（每次設定變動、動畫每一幀都重算） */
function syncOverlayData(map: MbMap, proj: PlaneProjector, cfg: PlaneModeConfig, animating: boolean) {
  const r = rings(proj, cfg.options.ringStepKm);
  setData(map, SRC.grat, graticule(proj));
  setData(map, SRC.rings, r.lines);
  setData(map, SRC.labels, {
    type: "FeatureCollection",
    features: [
      // 動畫中位置每幀在變，標籤會閃 → 只留中心點
      ...(animating ? [] : r.labels),
      ...(animating ? [] : destinationLabels(proj, cfg)),
      { type: "Feature", properties: { kind: "center", text: cfg.label }, geometry: { type: "Point", coordinates: [0, 0] } },
    ],
  });
}

/** 貴的部分：完整海岸線＋陸地填色（只在投影定下來之後算一次） */
function syncLandData(map: MbMap, proj: PlaneProjector, data: LandData) {
  const polys = projectPolygons(proj, data.polygons);
  setData(map, SRC.land, {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: polys } }],
  });
  const parts: [number, number][][] = [];
  for (const poly of data.polygons) {
    for (const flat of poly) {
      const line: [number, number][] = new Array(flat.length / 2);
      for (let i = 0; i < line.length; i++) line[i] = [flat[i * 2]!, flat[i * 2 + 1]!];
      parts.push(...projectLine(proj, line, 2));
    }
  }
  setData(map, SRC.coast, { type: "FeatureCollection", features: [lines(parts)] });
}

/** 動畫中：粗海岸線、不填色 */
function syncCoarseLand(map: MbMap, proj: PlaneProjector, data: LandData) {
  const parts: [number, number][][] = [];
  for (const line of data.coarse) parts.push(...projectLine(proj, line, 3));
  setData(map, SRC.coast, { type: "FeatureCollection", features: [lines(parts)] });
  setData(map, SRC.land, EMPTY);
}

// ── 自畫底圖：圖層與樣式 ─────────────────────────────────────

function ensureLayers(map: MbMap) {
  for (const id of Object.values(SRC)) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: EMPTY });
  // 圖層放在軌跡 custom layer 底下；plane-* 開頭，不會被 guard 藏掉
  const before = map.getLayer(FLIGHT_LAYER) ? FLIGHT_LAYER : undefined;
  const add = (layer: LayerSpecification) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  };
  add({ id: LYR.land, type: "fill", source: SRC.land, paint: { "fill-antialias": false } });
  add({ id: LYR.grat, type: "line", source: SRC.grat, paint: { "line-width": 0.6 } });
  add({ id: LYR.coast, type: "line", source: SRC.coast, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.7, 6, 1.2] } });
  add({
    id: LYR.rings,
    type: "line",
    source: SRC.rings,
    paint: { "line-width": ["case", ["boolean", ["get", "rim"], false], 1.2, ["boolean", ["get", "major"], false], 1, 0.7] },
  });
  add({
    id: LYR.ringLabel,
    type: "symbol",
    source: SRC.labels,
    filter: ["==", ["get", "kind"], "ring"],
    layout: {
      "text-field": ["get", "text"],
      "text-font": LABEL_FONT,
      "text-size": 11,
      "text-anchor": "top-left",
      "text-offset": [0.3, 0.2],
      "symbol-sort-key": ["get", "sort"],
    },
    paint: { "text-halo-width": 1.2 },
  });
  add({
    id: LYR.destDot,
    type: "circle",
    source: SRC.labels,
    filter: ["==", ["get", "kind"], "dest"],
    paint: { "circle-radius": 2.5, "circle-stroke-width": 1 },
  });
  add({
    id: LYR.destLabel,
    type: "symbol",
    source: SRC.labels,
    filter: ["==", ["get", "kind"], "dest"],
    layout: {
      // 第一行機場代碼、第二行距離（小一號）
      "text-field": ["format", ["get", "code"], {}, "\n", {}, ["get", "dist"], { "font-scale": 0.85 }],
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-line-height": 1.1,
      "text-justify": "auto",
      "text-variable-anchor": ["left", "right", "top", "bottom"],
      "text-radial-offset": 0.6,
      "symbol-sort-key": ["get", "sort"],
    },
    paint: { "text-halo-width": 1.4 },
  });
  add({
    id: LYR.center,
    type: "circle",
    source: SRC.labels,
    filter: ["==", ["get", "kind"], "center"],
    paint: { "circle-radius": 3.5, "circle-stroke-width": 1 },
  });
  add({
    id: LYR.centerLabel,
    type: "symbol",
    source: SRC.labels,
    filter: ["==", ["get", "kind"], "center"],
    layout: {
      "text-field": ["get", "text"],
      "text-font": LABEL_FONT,
      "text-size": 12,
      "text-anchor": "bottom-left",
      "text-offset": [0.5, -0.4],
      "text-allow-overlap": true,
    },
    paint: { "text-halo-width": 1.4 },
  });
}

/** 顏色、亮度、填色開關：每次都寫（主題或選項變了圖層已存在） */
function applyPaint(map: MbMap, cfg: PlaneModeConfig, isDark: boolean) {
  const c = isDark ? PLANE_BASEMAP_COLORS.dark : PLANE_BASEMAP_COLORS.light;
  const op = Math.max(0, Math.min(1, cfg.options.basemapOpacity));
  map.setPaintProperty(LYR.land, "fill-color", c.land);
  map.setPaintProperty(LYR.land, "fill-opacity", cfg.options.landFill ? op : 0);
  map.setPaintProperty(LYR.grat, "line-color", c.grat);
  map.setPaintProperty(LYR.grat, "line-opacity", op);
  map.setPaintProperty(LYR.coast, "line-color", c.coast);
  map.setPaintProperty(LYR.coast, "line-opacity", op);
  map.setPaintProperty(LYR.rings, "line-color", [
    "case",
    ["boolean", ["get", "rim"], false], c.rim,
    ["boolean", ["get", "major"], false], c.ringMajor,
    c.ring,
  ]);
  map.setPaintProperty(LYR.ringLabel, "text-color", c.label);
  map.setPaintProperty(LYR.ringLabel, "text-halo-color", c.halo);
  map.setPaintProperty(LYR.destDot, "circle-color", c.dest);
  map.setPaintProperty(LYR.destDot, "circle-stroke-color", c.halo);
  map.setPaintProperty(LYR.destLabel, "text-color", c.dest);
  map.setPaintProperty(LYR.destLabel, "text-halo-color", c.halo);
  map.setPaintProperty(LYR.center, "circle-color", c.center);
  map.setPaintProperty(LYR.center, "circle-stroke-color", c.halo);
  map.setPaintProperty(LYR.centerLabel, "text-color", c.center);
  map.setPaintProperty(LYR.centerLabel, "text-halo-color", c.halo);
}

function removeBasemap(map: MbMap) {
  for (const id of Object.values(LYR)) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of Object.values(SRC)) if (map.getSource(id)) map.removeSource(id);
}

// ── 投影套用與展開動畫 ───────────────────────────────────────

function stopAnim(st: State) {
  if (st.anim !== null) cancelAnimationFrame(st.anim);
  st.anim = null;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** 把目前投影（可帶漸變）套到軌跡座標與便宜的底圖資料 */
function applyProjection(map: MbMap, cfg: PlaneModeConfig, morph: PlaneMorph | undefined): PlaneProjector {
  setPlaneProjection({ kind: cfg.kind, lat: cfg.lat, lng: cfg.lng, morph });
  const proj = createPlaneProjector(cfg.kind, cfg.lat, cfg.lng, morph);
  syncOverlayData(map, proj, cfg, morph !== undefined);
  return proj;
}

/** 投影定下來：完整陸地（資料還沒下載就等它），投影沒變就不重算 */
function settle(map: MbMap, st: State, cfg: PlaneModeConfig) {
  const proj = applyProjection(map, cfg, undefined);
  const key = `${cfg.kind}|${cfg.lat}|${cfg.lng}`;
  if (st.landKey === key) return;
  const seq = ++st.seq;
  const run = (data: LandData) => {
    if (states.get(map) !== st || st.seq !== seq || st.anim !== null || !map.getSource(SRC.land)) return;
    syncLandData(map, proj, data);
    st.landKey = key;
    notifyActivity(map);
  };
  if (land) run(land);
  else loadLand().then(run).catch((err) => console.warn("[plane] 陸地資料載入失敗", err));
}

function startMorph(map: MbMap, st: State, from: PlaneRadial) {
  stopAnim(st);
  st.landKey = ""; // 動畫中陸地是粗的，結束後要重算
  st.seq++;
  const t0 = performance.now();
  const frame = () => {
    const cfg = st.cfg;
    if (states.get(map) !== st || !cfg) return; // 模式已離開
    const x = Math.min(1, (performance.now() - t0) / PLANE_MORPH_MS);
    if (x >= 1) {
      st.anim = null;
      settle(map, st, cfg);
      notifyActivity(map);
      return;
    }
    const proj = applyProjection(map, cfg, { from, t: easeInOut(x) });
    if (land) syncCoarseLand(map, proj, land);
    notifyActivity(map);
    st.anim = requestAnimationFrame(frame);
  };
  if (!land) loadLand().catch(() => undefined); // 先開始下載，動畫中拿得到就畫
  frame();
}

// ── 進入／更新／離開 ─────────────────────────────────────────

export interface ApplyPlaneOptions {
  /** 從哪個徑向函數展開過來（"ortho" = 從地球正面展開；另一種投影 = 兩種投影之間漸變）。不給就直接切 */
  animateFrom?: PlaneRadial;
}

/**
 * 進入或更新平面投影模式（冪等）。底圖 style 重載後（style.load）也呼叫這支，
 * 會把新 style 的圖層重新藏好、補回自畫底圖。
 */
export function applyPlaneMode(map: MbMap, cfg: PlaneModeConfig, isDark: boolean, opts: ApplyPlaneOptions = {}) {
  let st = states.get(map);
  if (!st) {
    st = {
      wanted: new Map(),
      origSetLayoutProperty: map.setLayoutProperty,
      origAddLayer: map.addLayer,
      cfg: null,
      landKey: "",
      seq: 0,
      anim: null,
    };
    states.set(map, st);
    installGuards(map, st);
  }
  const prev = st.cfg;
  st.cfg = cfg;

  if (map.getProjection()?.name !== "mercator") map.setProjection("mercator");
  // 地形會把假經緯度上的線貼到「那個位置的真實地形」上
  if (map.getTerrain()) map.setTerrain(null);
  // 軌跡 custom layer 只畫一份；畫面比世界寬時不要在左右重複底圖
  if (map.getRenderWorldCopies()) map.setRenderWorldCopies(false);
  hideRealWorldLayers(map, st);

  // style 重載後 source 全沒了 → 陸地要重灌
  if (!map.getSource(SRC.land)) st.landKey = "";
  ensureLayers(map);
  applyPaint(map, cfg, isDark);

  const sameProjection = prev !== null && prev.kind === cfg.kind && prev.lat === cfg.lat && prev.lng === cfg.lng;
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (opts.animateFrom && !sameProjection && !reduceMotion) {
    startMorph(map, st, opts.animateFrom);
  } else if (st.anim === null || !sameProjection) {
    stopAnim(st);
    settle(map, st, cfg);
  }
  // 其餘情況＝動畫進行中只改了選項（亮度、距離圈…）：下一幀會讀到新的 st.cfg，不打斷
  notifyActivity(map);
}

/** 離開平面投影模式：還原圖層可見度與投影。地形由呼叫端的 restoreTerrain 掛回。 */
export function exitPlaneMode(map: MbMap, restoreTerrain: () => void) {
  const st = states.get(map);
  if (!st) return;
  stopAnim(st);
  states.delete(map);
  removeGuards(map);
  removeBasemap(map);
  for (const [id, v] of st.wanted) {
    if (v === "visible" && map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
  }
  setPlaneProjection(null);
  // app 其他地方不設這個值（Mapbox 預設 true）。不能用進入時讀到的值還原：
  // globe 低 zoom 下 getter 回 false，會把 false 當成原值存回去。
  map.setRenderWorldCopies(true);
  // 交還給底圖 style 自己的投影（dark／light 是 globe，satellite-v9 是 mercator），不能寫死
  map.setProjection(null);
  restoreTerrain();
  notifyActivity(map);
}

/** 讓整個投影圓盤剛好放進畫面的鏡頭（正上方俯視） */
export function planeFitCamera(map: MbMap, cfg: PlaneModeConfig): CameraOptions {
  const proj = createPlaneProjector(cfg.kind, cfg.lat, cfg.lng);
  const el = map.getContainer();
  const px = Math.min(el.clientWidth, el.clientHeight) * 0.9;
  // zoom z 時整個 mercator 世界寬 512·2^z px
  const zoom = Math.log2(px / (2 * proj.rimRadius * 512));
  return { center: [0, 0], zoom, pitch: 0, bearing: 0 };
}
