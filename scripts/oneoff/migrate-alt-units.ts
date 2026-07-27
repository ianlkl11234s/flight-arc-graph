/**
 * migrate-alt-units.ts — 一次性 SSOT 遷移：把 public/tracks/airports/*.jsonl 的高度全部反解為「公尺」
 *
 * 背景（兩個歷史 bug，2026-07 修掉）：
 *   1. fetch-tracks.ts 舊碼 `alt > 1000 ? round(alt*0.3048) : alt`
 *      → ≤1000 ft 的點以「生英呎」落地，>1000 ft 的點是公尺。同一條 path 混用兩種單位。
 *   2. retry-failed-tracks.ts 舊碼寫成 `[lat, lon, alt(生英呎), gspeed]`
 *      → 高度全程生英呎，且第 4 欄是地速不是 unix timestamp。
 *
 * FR24 flight-tracks 的 alt 一律是英呎，且恆為 25 ft 的倍數（1,087,809 個原始值 100% 符合），
 * 這是本腳本反解的依據。
 *
 * 判別式（對「非 retry 格式」記錄的每個 path 點 v = path[i][2]）：
 *   v === 0          → 保留 0（視為 missing，不參與歧義解析、也不當參考點）
 *   v > 1000         → 公尺（生英呎 >1000 都被舊碼轉掉了，不可能留下）
 *   v % 25 !== 0     → 公尺（生英呎必為 25 的倍數）
 *   v < 312          → 生英呎（已轉換的最小可能值 = round(1025×0.3048) = 312）
 *   v ∈ {450,625,800,975} → 歧義（1475/2050/2625/3200 ft 轉出的公尺剛好也是 25 倍數且 ≤1000）
 *   其餘             → 生英呎
 * 歧義點走兩段式：先分類完非歧義點，再取 index 距離最近的「非歧義且非 0」點的解碼公尺值當 ref，
 * 若 |round(v×0.3048) − ref| < |v − ref| 判英呎、否則保留公尺；整條 path 無可參考點時預設英呎。
 *
 * retry 格式記錄（path 所有點第 4 欄 max < 1e9 → 那是 gspeed 不是 unix ts）：
 *   所有非 0 的 alt 一律 ×0.3048（它們全是生英呎，任何量級）。
 *   ⚠️ 時間戳無法修復（原始 ts 沒被寫進來），保留原樣，只計數回報。
 *
 * ⚠️ 判別式不可重複執行：遷移後的公尺值（如 575 ft → 175 m）會被再判成英呎而二次轉換。
 *    因此完成後寫 marker public/tracks/.alt-units-migrated，marker 存在即拒絕再跑。
 *
 * Usage:
 *   npx tsx scripts/oneoff/migrate-alt-units.ts --self-test          # 判別式內建自測
 *   npx tsx scripts/oneoff/migrate-alt-units.ts --dry-run --only RCTP # 只統計不寫檔
 *   npx tsx scripts/oneoff/migrate-alt-units.ts --only RCTP,RCSS      # 限定檔案（不寫 marker）
 *   NODE_OPTIONS='--max-old-space-size=8192' npx tsx scripts/oneoff/migrate-alt-units.ts  # 全量
 */

import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  renameSync,
  unlinkSync,
  openSync,
  writeSync,
  closeSync,
} from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const TRACKS_DIR = resolve(ROOT, "public/tracks");
const AIRPORTS_DIR = join(TRACKS_DIR, "airports");
const MARKER_FILE = join(TRACKS_DIR, ".alt-units-migrated");
const REPORT_FILE =
  "/private/tmp/claude-501/-Users-migu-Desktop-----gen-ai-try-ichef-----GIS-plan-art/ff8fa048-720a-4439-adb9-b6f627b72601/scratchpad/migrate-report.json";

// ── 判別式 ────────────────────────────────────────────

const FT_TO_M = 0.3048;
/** 舊碼轉換後可能出現的最小公尺值 = round(1025 ft × 0.3048) */
const MIN_CONVERTED_M = 312;
/** 生英呎與「已轉公尺」在 ≤1000 且為 25 倍數時撞號的四個值 */
const AMBIGUOUS = new Set([450, 625, 800, 975]);
/** unix timestamp 下限（2001 年）；低於此代表第 4 欄不是時間戳 */
const TS_FLOOR = 1e9;

type Verdict = "zero" | "meters" | "feet" | "ambiguous";

function classify(v: number): Verdict {
  if (v === 0) return "zero";
  if (v > 1000) return "meters";
  if (v % 25 !== 0) return "meters";
  if (v < MIN_CONVERTED_M) return "feet";
  if (AMBIGUOUS.has(v)) return "ambiguous";
  return "feet";
}

interface DecodeStats {
  convertedPoints: number;
  ambiguousFeet: number;
  ambiguousMeters: number;
  ambiguousFallback: number;
}

function emptyDecodeStats(): DecodeStats {
  return {
    convertedPoints: 0,
    ambiguousFeet: 0,
    ambiguousMeters: 0,
    ambiguousFallback: 0,
  };
}

/** 找 index 距離 i 最近、且有解碼值（非歧義非 0）的參考點；同距離時取左側。 */
function nearestRef(refs: (number | null)[], i: number): number | null {
  for (let d = 1; d < refs.length; d++) {
    const left = i - d;
    if (left >= 0) {
      const r = refs[left];
      if (r !== null && r !== undefined) return r;
    }
    const right = i + d;
    if (right < refs.length) {
      const r = refs[right];
      if (r !== null && r !== undefined) return r;
    }
    if (left < 0 && right >= refs.length) break;
  }
  return null;
}

/**
 * 反解一條「非 retry 格式」的 path，回傳每個點的公尺高度。
 * 只讀 path[i][2]，不動其他欄位。
 */
export function decodeNormalPath(path: number[][], st: DecodeStats): number[] {
  const n = path.length;
  const verdicts: Verdict[] = new Array(n);
  const refs: (number | null)[] = new Array(n).fill(null);
  const out: number[] = new Array(n);

  // 第一段：非歧義點分類完畢（同時當作歧義點的參考來源）
  for (let i = 0; i < n; i++) {
    const v = Number(path[i]?.[2] ?? 0);
    const verdict = classify(v);
    verdicts[i] = verdict;
    if (verdict === "feet") {
      out[i] = Math.round(v * FT_TO_M);
      refs[i] = out[i]!;
    } else if (verdict === "meters") {
      out[i] = v;
      refs[i] = v;
    } else {
      out[i] = v; // zero 保留 0；ambiguous 待第二段覆寫
    }
  }

  // 第二段：歧義點靠最近的非歧義點裁決
  for (let i = 0; i < n; i++) {
    if (verdicts[i] !== "ambiguous") continue;
    const v = Number(path[i]?.[2] ?? 0);
    const asFeet = Math.round(v * FT_TO_M);
    const ref = nearestRef(refs, i);
    if (ref === null) {
      out[i] = asFeet; // 整條 path 都沒有可參考點（如直升機全程 800）→ 預設英呎
      st.ambiguousFallback++;
    } else if (Math.abs(asFeet - ref) < Math.abs(v - ref)) {
      out[i] = asFeet;
      st.ambiguousFeet++;
    } else {
      out[i] = v;
      st.ambiguousMeters++;
    }
  }

  for (let i = 0; i < n; i++) {
    if (out[i] !== Number(path[i]?.[2] ?? 0)) st.convertedPoints++;
  }
  return out;
}

/** retry-failed-tracks.ts 舊輸出：第 4 欄是 gspeed，全 path 的 max 遠低於 unix ts。 */
export function isRetryFormat(path: number[][]): boolean {
  if (!Array.isArray(path) || path.length === 0) return false;
  let max = -Infinity;
  for (const p of path) {
    const t = Number(p?.[3] ?? 0);
    if (t > max) max = t;
  }
  return max < TS_FLOOR;
}

/** retry 格式：所有非 0 的 alt 都是生英呎，無條件轉換。 */
export function decodeRetryPath(path: number[][], st: DecodeStats): number[] {
  const out: number[] = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    const v = Number(path[i]?.[2] ?? 0);
    out[i] = v === 0 ? 0 : Math.round(v * FT_TO_M);
    if (out[i] !== v) st.convertedPoints++;
  }
  return out;
}

// ── 單檔處理 ──────────────────────────────────────────

interface FileReport {
  icao: string;
  records: number;
  changedRecords: number;
  retryRecords: number;
  convertedPoints: number;
  ambiguousFeet: number;
  ambiguousMeters: number;
  ambiguousFallback: number;
  maxAltBefore: number;
  maxAltAfter: number;
  blankLines: number;
  badLines: number;
  noPathRecords: number;
}

/** 緩衝寫入（單檔可達 200MB+，不要把 output 全撈進記憶體） */
class BufferedWriter {
  private fd: number;
  private buf: string[] = [];
  private size = 0;
  private static readonly FLUSH_BYTES = 4 * 1024 * 1024;

  constructor(path: string) {
    this.fd = openSync(path, "w");
  }
  write(s: string) {
    this.buf.push(s);
    this.size += s.length;
    if (this.size >= BufferedWriter.FLUSH_BYTES) this.flush();
  }
  private flush() {
    if (this.buf.length === 0) return;
    writeSync(this.fd, this.buf.join(""));
    this.buf = [];
    this.size = 0;
  }
  close() {
    this.flush();
    closeSync(this.fd);
  }
}

function processFile(icao: string, dryRun: boolean): FileReport {
  const filePath = join(AIRPORTS_DIR, `${icao}.jsonl`);
  const tmpPath = `${filePath}.altmig.tmp`;
  const rep: FileReport = {
    icao,
    records: 0,
    changedRecords: 0,
    retryRecords: 0,
    convertedPoints: 0,
    ambiguousFeet: 0,
    ambiguousMeters: 0,
    ambiguousFallback: 0,
    maxAltBefore: -Infinity,
    maxAltAfter: -Infinity,
    blankLines: 0,
    badLines: 0,
    noPathRecords: 0,
  };
  const st = emptyDecodeStats();

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const writer = dryRun ? null : new BufferedWriter(tmpPath);

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!;
    // 檔尾 split 出來的空字串不算「空行」，也不重新寫出（改由結尾統一補 \n）
    const isTrailing = li === lines.length - 1 && line === "";
    if (isTrailing) continue;

    if (!line.trim()) {
      rep.blankLines++;
      writer?.write(line + "\n"); // 原樣保留
      continue;
    }

    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      rep.badLines++;
      writer?.write(line + "\n"); // 原樣保留
      continue;
    }

    const path = rec.path as number[][] | undefined;
    if (!Array.isArray(path) || path.length === 0) {
      rep.noPathRecords++;
      rep.records++;
      writer?.write(line + "\n");
      continue;
    }

    rep.records++;
    for (const p of path) {
      const v = Number(p?.[2] ?? 0);
      if (v > rep.maxAltBefore) rep.maxAltBefore = v;
    }

    const retry = isRetryFormat(path);
    if (retry) rep.retryRecords++;
    const before = st.convertedPoints;
    const decoded = retry
      ? decodeRetryPath(path, st)
      : decodeNormalPath(path, st);
    const changed = st.convertedPoints > before;

    for (let i = 0; i < path.length; i++) {
      const nv = decoded[i]!;
      if (nv > rep.maxAltAfter) rep.maxAltAfter = nv;
      path[i]![2] = nv; // 只改第 3 欄，其他欄位絲毫不動
    }

    if (changed) rep.changedRecords++;
    // 沒變動就原樣寫回原行（保留原始格式，避免無謂的 re-serialize 差異）
    writer?.write((changed ? JSON.stringify(rec) : line) + "\n");
  }

  if (writer) {
    writer.close();
    renameSync(tmpPath, filePath); // 原子替換
  } else if (existsSync(tmpPath)) {
    unlinkSync(tmpPath);
  }

  rep.convertedPoints = st.convertedPoints;
  rep.ambiguousFeet = st.ambiguousFeet;
  rep.ambiguousMeters = st.ambiguousMeters;
  rep.ambiguousFallback = st.ambiguousFallback;
  if (rep.maxAltBefore === -Infinity) rep.maxAltBefore = 0;
  if (rep.maxAltAfter === -Infinity) rep.maxAltAfter = 0;
  return rep;
}

// ── 自測（--self-test）───────────────────────────────

function selfTest(): void {
  console.log("=== migrate-alt-units --self-test ===\n");
  let pass = 0;
  let fail = 0;

  const check = (name: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
      pass++;
      console.log(`  ✅ ${name}`);
    } else {
      fail++;
      console.log(`  ❌ ${name}\n       期望 ${e}\n       實得 ${a}`);
    }
  };

  /** 把單純的高度序列包成 path（第 4 欄給合法 unix ts）→ 反解後回傳高度序列 */
  const runAlts = (alts: number[], st = emptyDecodeStats()) => {
    const path = alts.map((a, i) => [25 + i * 0.01, 121, a, 1_700_000_000 + i]);
    return decodeNormalPath(path, st);
  };

  // 1. CAL003 型降落：312 之後切成生英呎
  check(
    "降落序列 [358,343,312,925,850,750,675,600]",
    runAlts([358, 343, 312, 925, 850, 750, 675, 600]),
    [358, 343, 312, 282, 259, 229, 206, 183],
  );

  // 2. 起飛序列：前 4 個生英呎（800 歧義靠鄰點解成英呎），後 3 個已是公尺
  {
    const st = emptyDecodeStats();
    check(
      "起飛序列 [500,800,875,950,312,335,366]",
      runAlts([500, 800, 875, 950, 312, 335, 366], st),
      [152, 244, 267, 290, 312, 335, 366],
    );
    check("  └ 歧義判英呎數", st.ambiguousFeet, 1);
    check("  └ 歧義判公尺數", st.ambiguousMeters, 0);
  }

  // 3. 直升機全程 800：整條 path 無參考點 → fallback 判英呎
  {
    const st = emptyDecodeStats();
    check("全程 800（無參考點）", runAlts([800, 800, 800], st), [244, 244, 244]);
    check("  └ fallback 次數", st.ambiguousFallback, 3);
  }

  // 4. EVA3201 型爬升：328 非 25 倍數 → 公尺；450 靠鄰點 328 判公尺保留
  {
    const st = emptyDecodeStats();
    check(
      "爬升序列 [0,328,450,1181,4587,6401]",
      runAlts([0, 328, 450, 1181, 4587, 6401], st),
      [0, 328, 450, 1181, 4587, 6401],
    );
    check("  └ 轉換點數應為 0", st.convertedPoints, 0);
    check("  └ 歧義判公尺數", st.ambiguousMeters, 1);
  }

  // 5. retry 格式偵測 + 全量轉換
  {
    const retryPath = [[33.9, -118.4, 32975, 579]];
    check("retry 格式偵測", isRetryFormat(retryPath), true);
    check(
      "  └ 正常格式不誤判",
      isRetryFormat([[25.07, 121.23, 10668, 1_700_000_000]]),
      false,
    );
    const st = emptyDecodeStats();
    check("retry 路徑 32975 ft → m", decodeRetryPath(retryPath, st), [10051]);
  }

  // 6. 冪等性警示：對已遷移的輸出再跑判別式會二次轉換（575ft → 175m → 53m）
  {
    check("非冪等佐證：[175] 再跑會變 53", runAlts([175]), [53]);
    check("marker 守門（marker 存在時擋下實寫）", canProceed(true, false), false);
    check("marker 守門（--dry-run 不受 marker 限制）", canProceed(true, true), true);
    check("marker 不存在時可執行", canProceed(false, false), true);
  }

  console.log(`\n通過 ${pass} / 失敗 ${fail}`);
  if (fail > 0) process.exit(1);
}

/** marker 守門的純函式版（自測可驗）：marker 存在且非 dry-run → 不可執行 */
function canProceed(markerExists: boolean, dryRun: boolean): boolean {
  return dryRun || !markerExists;
}

// ── Main ──────────────────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }

  console.log("=== migrate-alt-units ===\n");

  const dryRun = process.argv.includes("--dry-run");
  const onlyIdx = process.argv.indexOf("--only");
  const only =
    onlyIdx !== -1
      ? process.argv[onlyIdx + 1]!
          .split(",")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      : null;

  if (!existsSync(AIRPORTS_DIR)) {
    console.error(`❌ 找不到 ${AIRPORTS_DIR}`);
    process.exit(1);
  }

  if (!canProceed(existsSync(MARKER_FILE), dryRun)) {
    console.error(`🛑 已存在 marker ${MARKER_FILE}`);
    console.error("   判別式不可重複執行（會把公尺再當英呎轉一次）。");
    console.error("   確定要重跑請先手動刪除 marker，並確認資料來源是未遷移的。");
    process.exit(1);
  }

  let files = readdirSync(AIRPORTS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(/\.jsonl$/, ""));
  if (only) {
    const avail = new Set(files);
    const missing = only.filter((i) => !avail.has(i));
    if (missing.length > 0) {
      console.error(`❌ 找不到這些機場的 JSONL: ${missing.join(", ")}`);
      process.exit(1);
    }
    files = only;
  }
  files.sort();

  console.log(
    `模式: ${dryRun ? "🧪 dry-run（不寫檔）" : "✍️  實寫"}` +
      `${only ? `／--only ${only.join(",")}` : "／全量"}`,
  );
  console.log(`目標: ${files.length} 個 JSONL\n`);

  const reports: FileReport[] = [];
  const t0 = Date.now();
  for (let i = 0; i < files.length; i++) {
    const icao = files[i]!;
    process.stdout.write(`[${i + 1}/${files.length}] ${icao} ... `);
    const rep = processFile(icao, dryRun);
    reports.push(rep);
    console.log(
      `${rep.records} 筆／改 ${rep.changedRecords}／轉 ${rep.convertedPoints} 點` +
        (rep.retryRecords > 0 ? `／retry ${rep.retryRecords}` : "") +
        `／max ${rep.maxAltBefore}→${rep.maxAltAfter}`,
    );
  }

  // ── 統計 ──
  const sum = (pick: (r: FileReport) => number) =>
    reports.reduce((s, r) => s + pick(r), 0);
  const total = {
    files: reports.length,
    records: sum((r) => r.records),
    changedRecords: sum((r) => r.changedRecords),
    retryRecords: sum((r) => r.retryRecords),
    convertedPoints: sum((r) => r.convertedPoints),
    ambiguousFeet: sum((r) => r.ambiguousFeet),
    ambiguousMeters: sum((r) => r.ambiguousMeters),
    ambiguousFallback: sum((r) => r.ambiguousFallback),
    blankLines: sum((r) => r.blankLines),
    badLines: sum((r) => r.badLines),
    noPathRecords: sum((r) => r.noPathRecords),
    maxAltBefore: Math.max(0, ...reports.map((r) => r.maxAltBefore)),
    maxAltAfter: Math.max(0, ...reports.map((r) => r.maxAltAfter)),
  };

  console.log("\n=== 統計 ===\n");
  console.log(`檔案:           ${total.files}`);
  console.log(`記錄:           ${total.records.toLocaleString()}`);
  console.log(
    `有變動的記錄:   ${total.changedRecords.toLocaleString()}` +
      ` (${total.records ? ((total.changedRecords / total.records) * 100).toFixed(1) : "0.0"}%)`,
  );
  console.log(
    `retry 格式記錄: ${total.retryRecords.toLocaleString()}（時間戳無法修復，僅轉高度）`,
  );
  console.log(`轉換點數:       ${total.convertedPoints.toLocaleString()}`);
  console.log(
    `歧義點:         判 feet ${total.ambiguousFeet.toLocaleString()}／` +
      `判 m ${total.ambiguousMeters.toLocaleString()}／` +
      `無參考 fallback ${total.ambiguousFallback.toLocaleString()}`,
  );
  console.log(`空行/壞行:      ${total.blankLines} / ${total.badLines}`);
  console.log(`無 path 記錄:   ${total.noPathRecords}`);
  console.log(`max alt:        ${total.maxAltBefore} → ${total.maxAltAfter}`);
  console.log(`耗時:           ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const touched = reports
    .filter((r) => r.convertedPoints > 0)
    .sort((a, b) => b.convertedPoints - a.convertedPoints);
  if (touched.length > 0) {
    console.log(`\n--- 轉換點數 Top ${Math.min(30, touched.length)}（共 ${touched.length} 檔有變動）---`);
    for (const r of touched.slice(0, 30)) {
      console.log(
        `  ${r.icao.padEnd(6)} 轉 ${String(r.convertedPoints).padStart(9)} 點` +
          `／記錄 ${String(r.changedRecords).padStart(6)}/${r.records}` +
          `／max ${r.maxAltBefore}→${r.maxAltAfter}`,
      );
    }
  }

  // 完整報告（含 per-file 全表）
  const report = {
    generatedAt: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "write",
    only,
    total,
    files: reports,
  };
  try {
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    console.log(`\n📄 完整報告: ${REPORT_FILE}`);
  } catch (e) {
    console.warn(`\n⚠️  報告寫入失敗（不影響遷移）: ${(e as Error).message}`);
  }

  // ── Marker ──
  if (dryRun) {
    console.log("\n🧪 dry-run 結束，未寫任何檔案、未寫 marker。");
    return;
  }
  if (only) {
    console.log(
      "\n⚠️  --only 模式不寫 marker（留給全量跑完寫）。已遷移的檔案請勿重跑本腳本。",
    );
    return;
  }
  writeFileSync(
    MARKER_FILE,
    JSON.stringify(
      {
        migratedAt: new Date().toISOString(),
        script: "scripts/oneoff/migrate-alt-units.ts",
        note: "public/tracks/airports/*.jsonl 的 path[i][2] 已全部反解為公尺；判別式不可重複執行。",
        ...total,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n✅ 已寫 marker: ${MARKER_FILE}`);
  console.log("   下一步：npx tsx scripts/split-tracks.ts 重建 region + manifest。");
}

main();
