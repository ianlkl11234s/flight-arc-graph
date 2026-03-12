import type { Flight } from "../types";
import { preprocessFlights } from "./flightLoader";

const S3_BASE =
  "https://migu-gis-data-collector.s3.ap-southeast-2.amazonaws.com/flight-arc";

interface ManifestDate {
  date: string;
  flightCount: number;
  airports: string[];
}

interface Manifest {
  lastUpdated: string;
  totalFlights: number;
  dates: ManifestDate[];
}

/**
 * 從 S3 manifest 檢查指定來源是否有新資料，
 * 若有則下載缺少的日期資料並合併。
 */
export async function mergeS3Updates(
  localFlights: Flight[],
  source: "tracks" | "airspace",
): Promise<Flight[]> {
  try {
    const manifestRes = await fetch(`${S3_BASE}/${source}/manifest.json`);
    if (!manifestRes.ok) return localFlights;
    const manifest: Manifest = await manifestRes.json();

    // 計算本地已有的日期集合
    const localDates = new Set<string>();
    for (const f of localFlights) {
      const ts = f.dep_time > 0 ? f.dep_time : (f.path[0]?.[3] ?? 0);
      if (ts > 0) localDates.add(new Date(ts * 1000).toISOString().slice(0, 10));
    }

    // 計算本地已有的機場集合
    const localAirports = new Set<string>();
    for (const f of localFlights) {
      if (f.origin_icao?.startsWith("RC")) localAirports.add(f.origin_icao);
      if (f.dest_icao?.startsWith("RC")) localAirports.add(f.dest_icao);
    }

    // 找出需要下載的日期
    const datesToFetch: ManifestDate[] = manifest.dates.filter((d) => {
      if (!localDates.has(d.date)) return true;
      if (d.airports.some((a) => !localAirports.has(a))) return true;
      return false;
    });

    if (datesToFetch.length === 0) {
      console.log(`[S3:${source}] No new data available.`);
      return localFlights;
    }

    console.log(`[S3:${source}] Found ${datesToFetch.length} date(s) to fetch:`,
      datesToFetch.map((d) => d.date).join(", "));

    // 平行下載所有新日期的資料
    const localIds = new Set(localFlights.map((f) => f.fr24_id));
    const fetches = datesToFetch.map(async (d) => {
      const [y, m, dd] = d.date.split("-");
      const url = `${S3_BASE}/${source}/${y}/${m}/${dd}/data.json`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const flights: Flight[] = await res.json();
      return preprocessFlights(flights).filter((f) => !localIds.has(f.fr24_id));
    });

    const results = await Promise.all(fetches);
    const newFlights = results.flat();

    if (newFlights.length === 0) {
      console.log(`[S3:${source}] All flights already present locally.`);
      return localFlights;
    }

    console.log(`[S3:${source}] Merged ${newFlights.length} new flights.`);
    return [...localFlights, ...newFlights];
  } catch (e) {
    console.warn(`[S3:${source}] Failed to check for updates:`, e);
    return localFlights;
  }
}
