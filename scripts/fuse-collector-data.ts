/**
 * 資料融合腳本：從 data-collectors API 下載三種飛機資料來源並融合
 *
 * 來源：
 *   1. flight_fr24      — 完整軌跡（降落台灣機場的航班）
 *   2. flight_fr24_zone — 空域快照（所有飛經台灣的飛機位置）
 *   3. flight_opensky   — 空域快照（精確高度 + 垂直速率）
 *
 * 融合策略：
 *   - 有完整軌跡的航班 → 直接使用
 *   - 快照資料 → 用 icao24 合併同一架飛機的觀測點 → 生成軌跡
 *   - 超過 30 分鐘無觀測 → 切成不同航段
 *
 * 用法：tsx scripts/fuse-collector-data.ts [日期 YYYY-MM-DD]
 */

import "dotenv/config";

const API_BASE = "https://gis-data-collectors.zeabur.app";
const API_KEY =
  "dcf23ef9fe5ea917417ea0d11823386ae3ea55c8dd35fb8589aec5a6b03e3a6b";

const SEGMENT_GAP_SEC = 30 * 60; // 30 分鐘無觀測 → 斷軌
const FT_TO_M = 0.3048;

// ---------- Types ----------

interface Fr24Flight {
  fr24_id: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  origin_icao: string;
  origin_iata: string;
  dest_icao: string;
  dest_iata: string;
  dep_time: number;
  arr_time: number;
  status: string;
  trail_points: number;
  path: [number, number, number, number][];
}

interface Fr24ZoneAircraft {
  icao24: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  latitude: number;
  longitude: number;
  altitude_ft: number;
  speed_kts: number;
  track: number;
  origin_iata: string;
  destination_iata: string;
  vertical_speed: number;
  on_ground: boolean;
  squawk: string;
  timestamp: number;
  fr24_id: string;
}

interface OpenSkyAircraft {
  icao24: string;
  callsign: string;
  origin_country: string;
  time_position: number;
  last_contact: number;
  longitude: number;
  latitude: number;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;
  sensors: null;
  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
  category: number | null;
}

interface Observation {
  lat: number;
  lng: number;
  alt_m: number;
  timestamp: number;
  source: "fr24_zone" | "opensky";
}

interface AircraftInfo {
  icao24: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  origin_iata: string;
  destination_iata: string;
  fr24_id: string;
}

// ---------- API helpers ----------

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-API-Key": API_KEY },
  });
  if (!res.ok)
    throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiDownload<T>(
  collector: string,
  date: string,
  filename: string,
): Promise<T | null> {
  const [y, m, d] = date.split("-");
  const path = `/api/download/${collector}/${y}/${m}/${d}/${filename}`;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "X-API-Key": API_KEY },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

interface FileInfo {
  filename: string;
  modified: string;
  size: number;
  source: string;
}

async function listFiles(
  collector: string,
  date: string,
): Promise<FileInfo[]> {
  const data = await apiGet<{ files: FileInfo[] }>(
    `/api/data/${collector}/${date}`,
  );
  return data.files;
}

// ---------- Download snapshots for a date ----------

async function downloadAllSnapshots<T>(
  collector: string,
  date: string,
  concurrency = 5,
): Promise<T[]> {
  const files = await listFiles(collector, date);
  console.log(`  ${collector}: ${files.length} files`);

  const results: T[] = [];
  let failures = 0;
  for (let i = 0; i < files.length; i += concurrency) {
    const batch = files.slice(i, i + concurrency);
    const promises = batch.map((f) =>
      apiDownload<T>(collector, date, f.filename),
    );
    const batchResults = await Promise.all(promises);
    for (const r of batchResults) {
      if (r) results.push(r);
      else failures++;
    }
    process.stdout.write(
      `    ${collector}: ${Math.min(i + concurrency, files.length)}/${files.length} (${failures} failed)\r`,
    );
  }
  console.log(
    `    ${collector}: ${results.length}/${files.length} downloaded (${failures} failed)`,
  );
  return results;
}

/** fr24 collector 是累積式的，只需要最後一個快照 */
async function downloadLastFr24Snapshot(
  date: string,
): Promise<{ data: Fr24Flight[]; fetch_time: string }[]> {
  const files = await listFiles("flight_fr24", date);
  if (files.length === 0) return [];

  // 取時間最晚的那個（檔名格式 flight_fr24_HHMM.json）
  const sorted = [...files].sort((a, b) =>
    b.filename.localeCompare(a.filename),
  );
  const lastFile = sorted[0]!;
  console.log(`  flight_fr24: using last snapshot ${lastFile.filename} (of ${files.length})`);

  const data = await apiDownload<{ data: Fr24Flight[]; fetch_time: string }>(
    "flight_fr24",
    date,
    lastFile.filename,
  );
  return data ? [data] : [];
}

// ---------- Fusion logic ----------

function fuseData(
  fr24Snapshots: { data: Fr24Flight[]; fetch_time: string }[],
  zoneSnapshots: { data: Fr24ZoneAircraft[]; fetch_time: string }[],
  openskySnapshots: { data: OpenSkyAircraft[]; fetch_time: string }[],
) {
  // Step 1: Collect all complete trails from fr24
  const completeFlights: Fr24Flight[] = [];
  const seenFr24Ids = new Set<string>();

  // fr24 collector snapshots accumulate flights throughout the day
  // Use the last snapshot (most complete)
  const lastFr24 = fr24Snapshots.sort(
    (a, b) => a.fetch_time.localeCompare(b.fetch_time),
  );
  if (lastFr24.length > 0) {
    const finalSnapshot = lastFr24[lastFr24.length - 1]!;
    for (const f of finalSnapshot.data) {
      if (f.path && f.path.length > 1) {
        completeFlights.push(f);
        seenFr24Ids.add(f.fr24_id);
      }
    }
  }
  console.log(
    `\n[Fuse] Complete trails from fr24 collector: ${completeFlights.length}`,
  );

  // Step 2: Collect all observations from zone + opensky snapshots
  // Group by icao24
  const aircraftObs = new Map<string, Observation[]>();
  const aircraftInfo = new Map<string, AircraftInfo>();
  const fr24IdToIcao24 = new Map<string, string>();

  // Process fr24_zone snapshots
  for (const snap of zoneSnapshots) {
    for (const a of snap.data) {
      if (a.on_ground) continue;
      if (!a.icao24 || !a.latitude || !a.longitude) continue;

      // Track fr24_id → icao24 mapping
      if (a.fr24_id) {
        fr24IdToIcao24.set(a.fr24_id, a.icao24);
      }

      const obs: Observation = {
        lat: a.latitude,
        lng: a.longitude,
        alt_m: Math.round(a.altitude_ft * FT_TO_M),
        timestamp: a.timestamp,
        source: "fr24_zone",
      };

      if (!aircraftObs.has(a.icao24)) {
        aircraftObs.set(a.icao24, []);
        aircraftInfo.set(a.icao24, {
          icao24: a.icao24,
          callsign: a.callsign || "",
          registration: a.registration || "",
          aircraft_type: a.aircraft_type || "",
          origin_iata: a.origin_iata || "",
          destination_iata: a.destination_iata || "",
          fr24_id: a.fr24_id || "",
        });
      }
      aircraftObs.get(a.icao24)!.push(obs);

      // Update info with latest non-empty values
      const info = aircraftInfo.get(a.icao24)!;
      if (a.callsign) info.callsign = a.callsign;
      if (a.registration) info.registration = a.registration;
      if (a.aircraft_type) info.aircraft_type = a.aircraft_type;
      if (a.origin_iata) info.origin_iata = a.origin_iata;
      if (a.destination_iata) info.destination_iata = a.destination_iata;
      if (a.fr24_id) info.fr24_id = a.fr24_id;
    }
  }

  // Process opensky snapshots
  for (const snap of openskySnapshots) {
    for (const a of snap.data) {
      if (a.on_ground) continue;
      if (!a.icao24 || a.latitude == null || a.longitude == null) continue;

      const alt =
        a.geo_altitude ?? a.baro_altitude ?? 0;
      const obs: Observation = {
        lat: a.latitude,
        lng: a.longitude,
        alt_m: Math.round(alt),
        timestamp: a.time_position || a.last_contact,
        source: "opensky",
      };

      if (!aircraftObs.has(a.icao24)) {
        aircraftObs.set(a.icao24, []);
        aircraftInfo.set(a.icao24, {
          icao24: a.icao24,
          callsign: (a.callsign || "").trim(),
          registration: "",
          aircraft_type: "",
          origin_iata: "",
          destination_iata: "",
          fr24_id: "",
        });
      }
      aircraftObs.get(a.icao24)!.push(obs);

      // Update callsign if available
      const info = aircraftInfo.get(a.icao24)!;
      if (a.callsign && a.callsign.trim()) info.callsign = a.callsign.trim();
    }
  }

  console.log(
    `[Fuse] Unique aircraft from snapshots: ${aircraftObs.size}`,
  );

  // Step 3: Filter out aircraft that already have complete trails
  const icao24sWithCompleteTrail = new Set<string>();
  for (const fr24Id of seenFr24Ids) {
    const icao24 = fr24IdToIcao24.get(fr24Id);
    if (icao24) icao24sWithCompleteTrail.add(icao24);
  }

  // Also check by fr24_id in aircraft info
  for (const [icao24, info] of aircraftInfo) {
    if (info.fr24_id && seenFr24Ids.has(info.fr24_id)) {
      icao24sWithCompleteTrail.add(icao24);
    }
  }

  console.log(
    `[Fuse] Aircraft with complete trails (will skip snapshots): ${icao24sWithCompleteTrail.size}`,
  );

  // Step 4: Build interpolated flights from remaining aircraft
  const interpolatedFlights: Fr24Flight[] = [];
  let segmentCount = 0;

  for (const [icao24, observations] of aircraftObs) {
    if (icao24sWithCompleteTrail.has(icao24)) continue;

    // Sort by timestamp
    observations.sort((a, b) => a.timestamp - b.timestamp);

    // Deduplicate: fr24_zone 和 opensky 幾乎同時快照同一架飛機
    // 間隔 < 60 秒的重複觀測，優先保留 fr24_zone（有 origin/dest）
    const deduped: Observation[] = [];
    for (const obs of observations) {
      if (deduped.length === 0) {
        deduped.push(obs);
        continue;
      }
      const prev = deduped[deduped.length - 1]!;
      const gap = obs.timestamp - prev.timestamp;
      if (gap < 60) {
        // 同時間的重複觀測：優先保留 fr24_zone
        if (obs.source === "fr24_zone" && prev.source === "opensky") {
          deduped[deduped.length - 1] = obs;
        }
        // 否則保留已有的（先到的 fr24_zone 或同源跳過）
        continue;
      }
      deduped.push(obs);
    }

    if (deduped.length < 2) continue;

    // Split into segments by gap
    const segments: Observation[][] = [];
    let currentSegment: Observation[] = [deduped[0]!];

    for (let i = 1; i < deduped.length; i++) {
      const gap = deduped[i]!.timestamp - deduped[i - 1]!.timestamp;
      if (gap > SEGMENT_GAP_SEC) {
        if (currentSegment.length >= 2) {
          segments.push(currentSegment);
        }
        currentSegment = [deduped[i]!];
      } else {
        currentSegment.push(deduped[i]!);
      }
    }
    if (currentSegment.length >= 2) {
      segments.push(currentSegment);
    }

    const info = aircraftInfo.get(icao24)!;

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]!;
      const path: [number, number, number, number][] = seg.map((o) => [
        o.lat,
        o.lng,
        o.alt_m,
        o.timestamp,
      ]);

      interpolatedFlights.push({
        fr24_id: `snap_${icao24}_${si}`,
        callsign: info.callsign,
        registration: info.registration,
        aircraft_type: info.aircraft_type,
        origin_icao: "",
        origin_iata: info.origin_iata,
        dest_icao: "",
        dest_iata: info.destination_iata,
        dep_time: path[0]![3],
        arr_time: path[path.length - 1]![3],
        status: "snapshot",
        trail_points: path.length,
        path,
      });
      segmentCount++;
    }
  }

  console.log(
    `[Fuse] Interpolated flights from snapshots: ${interpolatedFlights.length} (${segmentCount} segments)`,
  );

  // Step 5: Combine
  const allFlights = [...completeFlights, ...interpolatedFlights];
  console.log(`[Fuse] Total flights: ${allFlights.length}`);

  return allFlights;
}

// ---------- Main ----------

async function main() {
  const targetDate = process.argv[2] || "2026-03-04";
  console.log(`\nFusing flight data for ${targetDate}\n`);

  // Check available dates
  const dates = await apiGet<{ dates: string[] }>(
    `/api/data/flight_fr24/dates`,
  );
  console.log(`Available fr24 dates: ${dates.dates.join(", ")}`);

  // Download data from all three sources
  console.log(`\nDownloading snapshots for ${targetDate}...`);

  let fr24Snapshots: { data: Fr24Flight[]; fetch_time: string }[] = [];
  let zoneSnapshots: { data: Fr24ZoneAircraft[]; fetch_time: string }[] = [];
  let openskySnapshots: { data: OpenSkyAircraft[]; fetch_time: string }[] = [];

  // Check which sources have data for this date
  try {
    const fr24Dates = await apiGet<{ dates: string[] }>(
      `/api/data/flight_fr24/dates`,
    );
    if (fr24Dates.dates.includes(targetDate)) {
      fr24Snapshots = await downloadLastFr24Snapshot(targetDate);
    } else {
      console.log("  flight_fr24: no data for this date");
    }
  } catch (e) {
    console.log(`  flight_fr24: error - ${e}`);
  }

  try {
    const zoneDates = await apiGet<{ dates: string[] }>(
      `/api/data/flight_fr24_zone/dates`,
    );
    if (zoneDates.dates.includes(targetDate)) {
      zoneSnapshots = await downloadAllSnapshots<{
        data: Fr24ZoneAircraft[];
        fetch_time: string;
      }>("flight_fr24_zone", targetDate);
    } else {
      console.log("  flight_fr24_zone: no data for this date");
    }
  } catch (e) {
    console.log(`  flight_fr24_zone: error - ${e}`);
  }

  try {
    const openskyDates = await apiGet<{ dates: string[] }>(
      `/api/data/flight_opensky/dates`,
    );
    if (openskyDates.dates.includes(targetDate)) {
      openskySnapshots = await downloadAllSnapshots<{
        data: OpenSkyAircraft[];
        fetch_time: string;
      }>("flight_opensky", targetDate);
    } else {
      console.log("  flight_opensky: no data for this date");
    }
  } catch (e) {
    console.log(`  flight_opensky: error - ${e}`);
  }

  // Fuse
  const fused = fuseData(fr24Snapshots, zoneSnapshots, openskySnapshots);

  // Write output
  const outputPath = "public/aviation_data_fused.json";
  const { writeFileSync } = await import("fs");
  writeFileSync(outputPath, JSON.stringify(fused, null, 0));
  console.log(`\nOutput written to ${outputPath}`);

  // Stats
  const completeCount = fused.filter(
    (f) => !f.fr24_id.startsWith("snap_"),
  ).length;
  const snapshotCount = fused.filter((f) =>
    f.fr24_id.startsWith("snap_"),
  ).length;
  const avgPoints =
    fused.length > 0
      ? Math.round(
          fused.reduce((sum, f) => sum + f.path.length, 0) / fused.length,
        )
      : 0;
  console.log(`\nStats:`);
  console.log(`  Complete trails: ${completeCount}`);
  console.log(`  Snapshot-based:  ${snapshotCount}`);
  console.log(`  Avg trail points: ${avgPoints}`);
  console.log(
    `  Time range: ${new Date(Math.min(...fused.map((f) => f.dep_time)) * 1000).toISOString()} ~ ${new Date(Math.max(...fused.map((f) => f.arr_time)) * 1000).toISOString()}`,
  );
}

main().catch(console.error);
