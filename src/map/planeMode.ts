/**
 * 平面方位投影模式的地圖端：切 Mapbox 到 mercator、藏掉所有真實經緯度的圖層、
 * 自畫底圖（海岸線／經緯網／距離圈）。投影數學在 planeProjection.ts。
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
  mercatorToLngLat,
  projectLine,
  rangeRing,
  type PlaneKind,
  type PlanePoint,
  type PlaneProjector,
} from "./planeProjection";
import { setPlaneProjection } from "../utils/coordinates";
import { notifyActivity } from "./repaintScheduler";
import { PLANE_BASEMAP_COLORS } from "../types/dataColors";

export interface PlaneModeConfig {
  kind: PlaneKind;
  /** 投影中心（緯度、經度） */
  lat: number;
  lng: number;
  /** 中心點標籤（機場 ICAO） */
  label: string;
}

const PREFIX = "plane-";
const KEEP_VISIBLE = new Set(["flight-3d"]);
const FLIGHT_LAYER = "flight-3d";
const COAST_URL = "./basemap/ne_50m_coast.json";
const RING_STEP_KM = 2000;
const RING_MAX_KM = 20000;
const LABEL_FONT = ["DIN Pro Medium", "Arial Unicode MS Regular"];

const SRC = { grat: "plane-grat", coast: "plane-coast", rings: "plane-rings", labels: "plane-labels" } as const;
const LYR = {
  grat: "plane-grat-line",
  coast: "plane-coast-line",
  rings: "plane-rings-line",
  ringLabel: "plane-ring-label",
  center: "plane-center-dot",
  centerLabel: "plane-center-label",
} as const;

type Visibility = "visible" | "none";
interface State {
  /** 各圖層「離開模式後應該是什麼」 */
  wanted: Map<string, Visibility>;
  origSetLayoutProperty: MbMap["setLayoutProperty"];
  origAddLayer: MbMap["addLayer"];
  cfgKey: string;
  /** 海岸線載入是非同步的；用序號丟掉過期的結果 */
  seq: number;
}
const states = new WeakMap<MbMap, State>();

let coastLines: number[][] | null = null;
let coastPromise: Promise<number[][]> | null = null;
function loadCoast(): Promise<number[][]> {
  if (coastLines) return Promise.resolve(coastLines);
  coastPromise ??= fetch(COAST_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`coastline ${r.status}`);
      return r.json() as Promise<{ lines: number[][] }>;
    })
    .then((j) => (coastLines = j.lines))
    .catch((err) => {
      coastPromise = null; // 下次進入再試
      throw err;
    });
  return coastPromise;
}

export function isPlaneModeActive(map: MbMap): boolean {
  return states.has(map);
}

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

// ── 自畫底圖 ─────────────────────────────────────────────────

type LineFeature = GeoJSON.Feature<GeoJSON.MultiLineString>;

function lineFeature(coords: [number, number][][], props: Record<string, unknown> = {}): LineFeature {
  return { type: "Feature", properties: props, geometry: { type: "MultiLineString", coordinates: coords } };
}

function graticule(proj: PlaneProjector): GeoJSON.FeatureCollection {
  const parts: [number, number][][] = [];
  for (let lng = -180; lng < 180; lng += 30) {
    parts.push(...projectLine(proj, [[lng, -88], [lng, 88]], 2));
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const line: [number, number][] = [];
    for (let lng = -180; lng <= 180; lng += 5) line.push([lng, lat]);
    parts.push(...projectLine(proj, line, 2));
  }
  return { type: "FeatureCollection", features: [lineFeature(parts)] };
}

function rings(proj: PlaneProjector): { lines: GeoJSON.FeatureCollection; labels: GeoJSON.Feature[] } {
  const features: LineFeature[] = [];
  const labels: GeoJSON.Feature[] = [];
  const pt: PlanePoint = { x: 0, y: 0 };
  for (let km = RING_STEP_KM; km <= RING_MAX_KM; km += RING_STEP_KM) {
    const ring = rangeRing(proj.lat0, proj.lng0, km, 2);
    const parts = projectLine(proj, ring, 2);
    if (parts.length === 0) continue;
    features.push(lineFeature(parts, { major: km % 10000 === 0 }));
    // 標籤放在方位 135°（東南）那一點
    const at = ring[Math.round((135 / 360) * (ring.length - 1))]!;
    if (proj.project(at[1], at[0], pt)) {
      labels.push({
        type: "Feature",
        properties: { kind: "ring", text: `${km.toLocaleString("en-US")} km` },
        geometry: { type: "Point", coordinates: mercatorToLngLat(pt.x, pt.y) },
      });
    }
  }
  // 投影邊界（圓）
  const rim: [number, number][] = [];
  for (let a = 0; a <= 360; a += 1) {
    const r = (a * Math.PI) / 180;
    rim.push(mercatorToLngLat(0.5 + proj.rimRadius * Math.cos(r), 0.5 + proj.rimRadius * Math.sin(r)));
  }
  features.push(lineFeature([rim], { rim: true }));
  return { lines: { type: "FeatureCollection", features }, labels };
}

function coast(proj: PlaneProjector, lines: number[][]): GeoJSON.FeatureCollection {
  const parts: [number, number][][] = [];
  for (const flat of lines) {
    const line: [number, number][] = new Array(flat.length / 2);
    for (let i = 0; i < line.length; i++) line[i] = [flat[i * 2]!, flat[i * 2 + 1]!];
    parts.push(...projectLine(proj, line, 2));
  }
  return { type: "FeatureCollection", features: [lineFeature(parts)] };
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function setData(map: MbMap, id: string, data: GeoJSON.FeatureCollection) {
  const src = map.getSource(id) as GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: "geojson", data });
}

function syncBasemap(map: MbMap, st: State, cfg: PlaneModeConfig, isDark: boolean) {
  const proj = createPlaneProjector(cfg.kind, cfg.lat, cfg.lng);
  const c = isDark ? PLANE_BASEMAP_COLORS.dark : PLANE_BASEMAP_COLORS.light;
  const r = rings(proj);

  setData(map, SRC.grat, graticule(proj));
  setData(map, SRC.rings, r.lines);
  setData(map, SRC.labels, {
    type: "FeatureCollection",
    features: [
      ...r.labels,
      { type: "Feature", properties: { kind: "center", text: cfg.label }, geometry: { type: "Point", coordinates: [0, 0] } },
    ],
  });
  if (!map.getSource(SRC.coast)) map.addSource(SRC.coast, { type: "geojson", data: EMPTY });

  // 海岸線：資料第一次要下載，之後換中心／換投影只是重算
  const seq = ++st.seq;
  const applyCoast = (lines: number[][]) => {
    if (states.get(map) !== st || st.seq !== seq || !map.getSource(SRC.coast)) return;
    setData(map, SRC.coast, coast(proj, lines));
    notifyActivity(map);
  };
  if (coastLines) applyCoast(coastLines);
  else loadCoast().then(applyCoast).catch((err) => console.warn("[plane] 海岸線載入失敗", err));

  // 圖層放在軌跡 custom layer 底下；plane-* 開頭，不會被 guard 藏掉
  const before = map.getLayer(FLIGHT_LAYER) ? FLIGHT_LAYER : undefined;
  const add = (layer: LayerSpecification) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer, before);
  };
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
      "text-allow-overlap": false,
    },
    paint: { "text-halo-width": 1.2 },
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

  // 顏色每次都寫（主題切換時圖層已存在）
  map.setPaintProperty(LYR.grat, "line-color", c.grat);
  map.setPaintProperty(LYR.coast, "line-color", c.coast);
  map.setPaintProperty(LYR.rings, "line-color", [
    "case",
    ["boolean", ["get", "rim"], false], c.rim,
    ["boolean", ["get", "major"], false], c.ringMajor,
    c.ring,
  ]);
  map.setPaintProperty(LYR.ringLabel, "text-color", c.label);
  map.setPaintProperty(LYR.ringLabel, "text-halo-color", c.halo);
  map.setPaintProperty(LYR.center, "circle-color", c.center);
  map.setPaintProperty(LYR.center, "circle-stroke-color", c.halo);
  map.setPaintProperty(LYR.centerLabel, "text-color", c.center);
  map.setPaintProperty(LYR.centerLabel, "text-halo-color", c.halo);
}

function removeBasemap(map: MbMap) {
  for (const id of Object.values(LYR)) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of Object.values(SRC)) if (map.getSource(id)) map.removeSource(id);
}

// ── 進入／更新／離開 ─────────────────────────────────────────

/**
 * 進入或更新平面投影模式（冪等）。底圖 style 重載後（style.load）也呼叫這支，
 * 會把新 style 的圖層重新藏好、補回自畫底圖。
 * 回傳 true = 投影中心或種類有變（呼叫端據此決定要不要移動鏡頭）。
 */
export function applyPlaneMode(map: MbMap, cfg: PlaneModeConfig, isDark: boolean): boolean {
  let st = states.get(map);
  if (!st) {
    st = {
      wanted: new Map(),
      origSetLayoutProperty: map.setLayoutProperty,
      origAddLayer: map.addLayer,
      cfgKey: "",
      seq: 0,
    };
    states.set(map, st);
    installGuards(map, st);
  }
  const cfgKey = `${cfg.kind}|${cfg.lat}|${cfg.lng}`;
  const changed = cfgKey !== st.cfgKey;
  st.cfgKey = cfgKey;

  if (map.getProjection()?.name !== "mercator") map.setProjection("mercator");
  // 地形會把假經緯度上的線貼到「那個位置的真實地形」上
  if (map.getTerrain()) map.setTerrain(null);
  // 軌跡 custom layer 只畫一份；畫面比世界寬時不要在左右重複底圖
  if (map.getRenderWorldCopies()) map.setRenderWorldCopies(false);
  hideRealWorldLayers(map, st);
  setPlaneProjection({ kind: cfg.kind, lat: cfg.lat, lng: cfg.lng });
  syncBasemap(map, st, cfg, isDark);
  notifyActivity(map);
  return changed;
}

/** 離開平面投影模式：還原圖層可見度與投影。地形由呼叫端的 restoreTerrain 掛回。 */
export function exitPlaneMode(map: MbMap, restoreTerrain: () => void) {
  const st = states.get(map);
  if (!st) return;
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
