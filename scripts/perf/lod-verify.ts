/**
 * scripts/perf/lod-verify.ts
 *
 * 驗證 `scripts/split-tracks.ts --lod-only` 產出的
 * public/tracks/airports/{ICAO}/{date}.l1.jsonl（eps 50m）與 .l2.jsonl（eps 250m），
 * 對照同機場同日期的全解析度 {date}.jsonl（L0）：
 *
 *   1. 航班數與 fr24_id 集合與 L0 完全相同
 *   2. 每個航班的起訖點座標與時間戳與 L0 完全相同
 *   3. 每個被抽掉的點到簡化線的 3D 垂距 ≤ eps（與 split-tracks.ts 的 dpSimplify3D 用
 *      同一套距離公式：水平公尺 + 高度 ×3 誇張後併入 3D 距離）
 *   4. 印出點數統計：每層總點數與相對 L0 的比例
 *
 * 任一項不過就報錯（process.exit(1)）並列出違規的 fr24_id。
 *
 * Usage:
 *   npx tsx scripts/perf/lod-verify.ts --airports RCTP,RJTT,RJAA,VHHH,ROAH,RJBB,RCSS --dates 2026-02-18
 *   npx tsx scripts/perf/lod-verify.ts   # 省略則掃全部已有 .l1.jsonl 的 {ICAO}/{date} 組合
 *
 * 注意：本檔的 3D 距離公式（perpDist3DMeters）必須與 scripts/split-tracks.ts 的
 * dpSimplify3D 保持一致（M_PER_DEG_LAT、ALT_EXAGGERATION 兩個常數同步），否則驗證會
 * 對錯誤的門檻打假分。改動任一邊的公式/係數時務必同步另一邊。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const AIRPORTS_DIR = join(ROOT, "public/tracks/airports");

interface Flight {
  fr24_id: string;
  dep_time: number;
  path: number[][];
  [key: string]: unknown;
}

// ── 與 scripts/split-tracks.ts 的 dpSimplify3D 同一套公式（見檔頭注意事項）──
const M_PER_DEG_LAT = 111_320;
const ALT_EXAGGERATION = 3;
const LOD_L1_EPSILON_M = 50;
const LOD_L2_EPSILON_M = 250;

function perpDist3DMeters(p: number[], a: number[], b: number[]): number {
  const cosLat = Math.cos((a[0]! * Math.PI) / 180);
  const az = (a[2] ?? 0) * ALT_EXAGGERATION;
  const bx = (b[0]! - a[0]!) * M_PER_DEG_LAT;
  const by = (b[1]! - a[1]!) * M_PER_DEG_LAT * cosLat;
  const bz = (b[2] ?? 0) * ALT_EXAGGERATION - az;
  const px = (p[0]! - a[0]!) * M_PER_DEG_LAT;
  const py = (p[1]! - a[1]!) * M_PER_DEG_LAT * cosLat;
  const pz = (p[2] ?? 0) * ALT_EXAGGERATION - az;
  const len2 = bx * bx + by * by + bz * bz;
  if (len2 === 0) {
    return Math.sqrt(px * px + py * py + pz * pz);
  }
  const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / len2));
  const dx = px - t * bx;
  const dy = py - t * by;
  const dz = pz - t * bz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function pointsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function readJsonl(path: string): Flight[] {
  const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
  return lines.map((line) => JSON.parse(line) as Flight);
}

// ── 目標探索 ──

const ICAO_RE = /^[A-Z0-9]{4}$/;
const L1_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.l1\.jsonl$/;

function discoverTargets(): { icao: string; date: string }[] {
  const targets: { icao: string; date: string }[] = [];
  for (const entry of readdirSync(AIRPORTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ICAO_RE.test(entry.name)) continue;
    const dailyDir = join(AIRPORTS_DIR, entry.name);
    for (const file of readdirSync(dailyDir)) {
      const m = L1_FILE_RE.exec(file);
      if (m) targets.push({ icao: entry.name, date: m[1]! });
    }
  }
  return targets;
}

function parseListArg(flag: string): string[] | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return undefined;
  return process.argv[idx + 1]?.split(",").map((s) => s.trim()).filter(Boolean);
}

// ── 單一 (icao, date, level) 驗證 ──

interface LevelResult {
  level: "L1" | "L2";
  epsMeters: number;
  ok: boolean;
  totalFlights: number;
  totalPtsL0: number;
  totalPtsLod: number;
  errors: string[];
}

function verifyLevel(
  icao: string,
  date: string,
  level: "L1" | "L2",
  epsMeters: number,
  l0Flights: Map<string, Flight>,
  lodPath: string,
): LevelResult {
  const result: LevelResult = {
    level,
    epsMeters,
    ok: true,
    totalFlights: 0,
    totalPtsL0: 0,
    totalPtsLod: 0,
    errors: [],
  };

  if (!existsSync(lodPath)) {
    result.ok = false;
    result.errors.push(`檔案不存在: ${lodPath}`);
    return result;
  }

  const lodFlights = readJsonl(lodPath);
  result.totalFlights = lodFlights.length;

  // 1. 航班數與 fr24_id 集合是否與 L0 完全相同
  const lodIds = new Set(lodFlights.map((f) => f.fr24_id));
  if (lodIds.size !== lodFlights.length) {
    result.ok = false;
    result.errors.push(`${level} 檔內有重複 fr24_id（${lodFlights.length} 行 → ${lodIds.size} 個 id）`);
  }
  if (lodIds.size !== l0Flights.size) {
    result.ok = false;
    result.errors.push(`航班數不符: L0=${l0Flights.size} ${level}=${lodIds.size}`);
  }
  const missingInLod = [...l0Flights.keys()].filter((id) => !lodIds.has(id));
  const extraInLod = [...lodIds].filter((id) => !l0Flights.has(id));
  if (missingInLod.length > 0) {
    result.ok = false;
    result.errors.push(`${level} 缺少 L0 有的 fr24_id（${missingInLod.length} 筆）: ${missingInLod.slice(0, 5).join(", ")}${missingInLod.length > 5 ? " ..." : ""}`);
  }
  if (extraInLod.length > 0) {
    result.ok = false;
    result.errors.push(`${level} 多出 L0 沒有的 fr24_id（${extraInLod.length} 筆）: ${extraInLod.slice(0, 5).join(", ")}${extraInLod.length > 5 ? " ..." : ""}`);
  }

  for (const lf of lodFlights) {
    const l0f = l0Flights.get(lf.fr24_id);
    if (!l0f) continue; // 已在上面記過 extraInLod
    const l0Path = l0f.path;
    const lodP = lf.path;

    result.totalPtsL0 += l0Path.length;
    result.totalPtsLod += lodP.length;

    if (l0Path.length === 0 || lodP.length === 0) {
      result.ok = false;
      result.errors.push(`${lf.fr24_id}: path 空陣列（L0=${l0Path.length} ${level}=${lodP.length}）`);
      continue;
    }

    // 2. 起訖點座標與時間戳須與 L0 完全相同
    if (!pointsEqual(lodP[0]!, l0Path[0]!)) {
      result.ok = false;
      result.errors.push(`${lf.fr24_id}: 起點不符 L0=${JSON.stringify(l0Path[0])} ${level}=${JSON.stringify(lodP[0])}`);
    }
    if (!pointsEqual(lodP[lodP.length - 1]!, l0Path[l0Path.length - 1]!)) {
      result.ok = false;
      result.errors.push(`${lf.fr24_id}: 訖點不符 L0=${JSON.stringify(l0Path[l0Path.length - 1])} ${level}=${JSON.stringify(lodP[lodP.length - 1])}`);
    }

    // 3. lodP 必須是 l0Path 的有序子序列（值相等），且每個被抽掉的點到簡化線段的
    //    3D 垂距 ≤ eps。用雙指標沿 l0Path 掃描比對每一段 [lodP[k], lodP[k+1]]。
    let li = 0;
    let brokenSubsequence = false;
    for (let k = 0; k < lodP.length - 1 && !brokenSubsequence; k++) {
      const segA = lodP[k]!;
      const segB = lodP[k + 1]!;

      while (li < l0Path.length && !pointsEqual(l0Path[li]!, segA)) li++;
      if (li >= l0Path.length) {
        result.ok = false;
        result.errors.push(`${lf.fr24_id}: ${level} 第 ${k} 點在 L0 中找不到對應（非子序列，可能被改值）`);
        brokenSubsequence = true;
        break;
      }
      const idxA = li;
      li++;

      let lj = li;
      while (lj < l0Path.length && !pointsEqual(l0Path[lj]!, segB)) lj++;
      if (lj >= l0Path.length) {
        result.ok = false;
        result.errors.push(`${lf.fr24_id}: ${level} 第 ${k + 1} 點在 L0 中找不到對應（非子序列，可能被改值）`);
        brokenSubsequence = true;
        break;
      }
      const idxB = lj;

      for (let m = idxA + 1; m < idxB; m++) {
        const d = perpDist3DMeters(l0Path[m]!, segA, segB);
        if (d > epsMeters) {
          result.ok = false;
          result.errors.push(
            `${lf.fr24_id}: ${level} 第 ${m} 個被抽掉的點垂距 ${d.toFixed(1)}m > eps ${epsMeters}m`,
          );
        }
      }
      li = idxB;
    }
  }

  return result;
}

// ── Main ──

function main() {
  const airportsFilter = parseListArg("--airports");
  const datesFilter = parseListArg("--dates");

  let targets: { icao: string; date: string }[];
  if (airportsFilter && airportsFilter.length > 0) {
    const dates = datesFilter && datesFilter.length > 0 ? datesFilter : undefined;
    targets = [];
    for (const icao of airportsFilter) {
      if (dates) {
        for (const date of dates) targets.push({ icao, date });
      } else {
        const dailyDir = join(AIRPORTS_DIR, icao);
        if (!existsSync(dailyDir)) continue;
        for (const file of readdirSync(dailyDir)) {
          const m = L1_FILE_RE.exec(file);
          if (m) targets.push({ icao, date: m[1]! });
        }
      }
    }
  } else {
    targets = discoverTargets();
    if (datesFilter && datesFilter.length > 0) {
      targets = targets.filter((t) => datesFilter.includes(t.date));
    }
  }

  if (targets.length === 0) {
    console.error("❌ 找不到任何 (機場, 日期) 目標（.l1.jsonl 不存在，或 --airports/--dates 篩選後為空）");
    process.exit(1);
  }

  console.log(`=== lod-verify：${targets.length} 組 (機場, 日期) ===\n`);

  let anyFail = false;
  const allErrors: string[] = [];

  for (const { icao, date } of targets) {
    const dailyDir = join(AIRPORTS_DIR, icao);
    const l0Path = join(dailyDir, `${date}.jsonl`);
    if (!existsSync(l0Path)) {
      console.error(`❌ ${icao} ${date}: L0 檔不存在 ${l0Path}`);
      anyFail = true;
      continue;
    }
    const l0Flights = new Map(readJsonl(l0Path).map((f) => [f.fr24_id, f]));
    const totalPtsL0 = [...l0Flights.values()].reduce((s, f) => s + f.path.length, 0);

    const l1Result = verifyLevel(icao, date, "L1", LOD_L1_EPSILON_M, l0Flights, join(dailyDir, `${date}.l1.jsonl`));
    const l2Result = verifyLevel(icao, date, "L2", LOD_L2_EPSILON_M, l0Flights, join(dailyDir, `${date}.l2.jsonl`));

    const fmtPct = (n: number) => (totalPtsL0 > 0 ? ((n / totalPtsL0) * 100).toFixed(1) : "0.0");

    const statusIcon = (r: LevelResult) => (r.ok ? "✅" : "❌");
    console.log(
      `${icao} ${date}: L0 ${l0Flights.size} flights / ${totalPtsL0} pts` +
        `  |  ${statusIcon(l1Result)} L1(eps ${LOD_L1_EPSILON_M}m) ${l1Result.totalPtsLod} pts (${fmtPct(l1Result.totalPtsLod)}%)` +
        `  |  ${statusIcon(l2Result)} L2(eps ${LOD_L2_EPSILON_M}m) ${l2Result.totalPtsLod} pts (${fmtPct(l2Result.totalPtsLod)}%)`,
    );

    for (const r of [l1Result, l2Result]) {
      if (!r.ok) {
        anyFail = true;
        for (const e of r.errors) {
          const line = `   [${icao} ${date} ${r.level}] ${e}`;
          console.error(line);
          allErrors.push(line);
        }
      }
    }
  }

  console.log("");
  if (anyFail) {
    console.error(`❌ lod-verify 失敗：${allErrors.length} 項違規（見上方列表）`);
    process.exit(1);
  } else {
    console.log(`✅ lod-verify 全過（${targets.length} 組 × L1/L2）`);
  }
}

main();
