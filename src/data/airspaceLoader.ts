import type { AirspaceCategory } from "../types/airspace";
import { classifyAirspace } from "../types/airspace";

export interface AirspaceFeature {
  id: string;             // region + layer + code + layer_index
  region: string;         // TW / UK / JP ...（來源區域）
  category: AirspaceCategory;
  layer: string;          // 原始 layer（RCR/TMA/...）
  nameZh: string;
  nameEn: string;
  code: string;
  floorM: number;
  ceilingM: number;
  floorRaw: string;       // "SFC" / "FL100" / "3000 FT AMSL"
  ceilingRaw: string;
  airspaceClass: string;
  remarks: string;        // 管理單位、限制條件（中英文）
  warnings: string[];     // 解析時的備註（如 PoC 僅保留首段）
  /** 外環 [lng, lat][]（不含多邊形洞） */
  ring: [number, number][];
}

interface RawGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
    properties: Record<string, unknown>;
  }>;
}

const DEFAULT_SOURCES: { region: string; url: string }[] = [
  { region: "TW", url: "./airspace/taiwan_airspace.geojson" },
  { region: "TW", url: "./airspace/taiwan_adiz.geojson" },
  { region: "UK", url: "./airspace/gb_airspace.geojson" },
  { region: "CN", url: "./airspace/cn_airspace.geojson" },
];

let cache: AirspaceFeature[] | null = null;
let loadingPromise: Promise<AirspaceFeature[]> | null = null;

function parseFeatures(region: string, raw: RawGeoJSON): AirspaceFeature[] {
  const out: AirspaceFeature[] = [];
  for (const f of raw.features) {
    const p = f.properties || {};
    const layer = String(p["layer"] ?? "");
    const code = String(p["code"] ?? "");
    const nameZh = String(p["name_zh"] || code);
    const nameEn = String(p["name_en"] ?? "");
    const floorM = Number(p["floor_m"] ?? 0);
    const ceilingMRaw = Number(p["ceiling_m"] ?? floorM);
    // UNL 上限 99999m 截斷到 20000m（避免破壞場景尺度）
    const ceilingM = Math.min(ceilingMRaw, 20000);
    const floorRaw = String(p["floor_raw"] ?? "");
    const ceilingRaw = String(p["ceiling_raw"] ?? "");
    const airspaceClass = String(p["airspace_class"] ?? "");
    const layerIndex = Number(p["layer_index"] ?? 0);
    const remarks = String(p["remarks"] ?? "").trim();
    const warnings = Array.isArray(p["warnings"]) ? (p["warnings"] as unknown[]).map(String) : [];
    const idBase = `${region}-${layer}-${code}-${layerIndex}`;
    const category = classifyAirspace(layer);

    if (f.geometry.type === "Polygon") {
      const coords = f.geometry.coordinates as number[][][];
      const ring = coords[0];
      if (ring && ring.length >= 3) {
        out.push({
          id: idBase, region, category, layer, nameZh, nameEn, code,
          floorM, ceilingM, floorRaw, ceilingRaw, airspaceClass,
          remarks, warnings,
          ring: ring.map((c) => [c[0]!, c[1]!] as [number, number]),
        });
      }
    } else if (f.geometry.type === "MultiPolygon") {
      const polys = f.geometry.coordinates as number[][][][];
      polys.forEach((poly, i) => {
        const ring = poly[0];
        if (ring && ring.length >= 3) {
          out.push({
            id: `${idBase}-${i}`,
            region, category, layer, nameZh, nameEn, code,
            floorM, ceilingM, floorRaw, ceilingRaw, airspaceClass,
            remarks, warnings,
            ring: ring.map((c) => [c[0]!, c[1]!] as [number, number]),
          });
        }
      });
    }
  }
  return out;
}

async function fetchSource(region: string, url: string): Promise<AirspaceFeature[]> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // 404 → 檔案未抓取（如 UK 尚未跑 fetch-uk-airspace），靜默略過
      if (res.status === 404) return [];
      console.warn(`[airspace] ${region} fetch failed: ${res.status} (${url})`);
      return [];
    }
    const raw = (await res.json()) as RawGeoJSON;
    return parseFeatures(region, raw);
  } catch (err) {
    console.warn(`[airspace] ${region} load error:`, err);
    return [];
  }
}

export async function loadAirspace(): Promise<AirspaceFeature[]> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const all = await Promise.all(
      DEFAULT_SOURCES.map(({ region, url }) => fetchSource(region, url)),
    );
    const merged = all.flat();
    cache = merged;
    return merged;
  })();

  return loadingPromise;
}

export function getCachedAirspace(): AirspaceFeature[] | null {
  return cache;
}
