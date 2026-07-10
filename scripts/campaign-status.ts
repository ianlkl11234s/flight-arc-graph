/**
 * Top-1000 軌跡戰役 — 一鍵狀態簡報
 *
 *   npx tsx scripts/campaign-status.ts            # 總覽
 *   npx tsx scripts/campaign-status.ts --batch 1  # 展開某批的機場清單 + 各機場進度
 *
 * 每次開工先跑它。所有數字都「現算」，不依賴會過期的文件：
 *   - 整體進度（掃描清單 vs track-done 差值推導）
 *   - 各批剩餘 + 目前該抓哪批
 *   - 本週期額度（手動錨點 − 帳本已花）
 *   - 漂移警告（抓完沒 split / 沒上 S3）
 *   - 建議指令（--max-credits 已算好，吃滿當下額度）
 */
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CAMPAIGN_FILE = resolve(ROOT, "scripts/campaign-top1000.json");
const TOP1000_FILE = resolve(ROOT, "scripts/top1000-airports.json");
const DONE_NDJSON = resolve(ROOT, "scripts/track-done.ndjson");
const SESSIONS_NDJSON = resolve(ROOT, "scripts/fetch-sessions.ndjson");
const FLIGHTS_DIR = resolve(ROOT, "scripts/flights");
const MANIFEST_FILE = resolve(ROOT, "public/tracks/manifest.json");
const UPLOAD_STATE = resolve(ROOT, "scripts/upload-state.json");

interface Batch {
  id: number;
  ranks: [number, number];
  planned: number;
}
interface Campaign {
  date: string;
  airports_file: string;
  credits_per_track: number;
  target_total: number;
  budget: {
    monthly_credits: number;
    manual_remaining: number;
    manual_remaining_as_of: string;
  };
  batches: Batch[];
}

const fmt = (n: number) => n.toLocaleString("en-US");

// 1) campaign 常數
const camp = JSON.parse(readFileSync(CAMPAIGN_FILE, "utf-8")) as Campaign;
const CPT = camp.credits_per_track;
const today = new Date().toISOString().slice(0, 10);

// --batch N：展開該批的機場清單（各機場進度）
const batchIdx = process.argv.indexOf("--batch");
const batchArg =
  batchIdx !== -1 ? parseInt(process.argv[batchIdx + 1]!, 10) : null;

// 2) track-done set
const done = new Set<string>();
if (existsSync(DONE_NDJSON)) {
  for (const line of readFileSync(DONE_NDJSON, "utf-8").split("\n")) {
    const id = line.trim();
    if (id) done.add(id);
  }
}

// 3) rank / 機場資訊 map（出發機場 → rank, iata, name）
const rawTop = JSON.parse(readFileSync(TOP1000_FILE, "utf-8"));
const topList: { icao: string; rank: number; iata?: string; name?: string }[] =
  Array.isArray(rawTop) ? rawTop : rawTop.airports ?? [];
const rankOf = new Map<string, number>();
const infoOf = new Map<string, { iata: string; name: string }>();
for (const a of topList) {
  rankOf.set(a.icao, a.rank);
  infoOf.set(a.icao, { iata: a.iata ?? "", name: a.name ?? "" });
}

// 4) 掃 scripts/flights → 各批 / 各機場剩餘（按出發機場 rank 歸屬）
const seen = new Set<string>();
const remainingByBatch = new Map<number, number>();
for (const b of camp.batches) remainingByBatch.set(b.id, 0);
const perAirport = new Map<
  string,
  { rank: number; total: number; rem: number }
>();
let totalRemaining = 0;
let scannedUnique = 0;
if (existsSync(FLIGHTS_DIR)) {
  for (const icao of readdirSync(FLIGHTS_DIR)) {
    const dir = join(FLIGHTS_DIR, icao);
    if (!statSync(dir).isDirectory()) continue;
    const rank = rankOf.get(icao);
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      let payload: { flights?: { fr24_id: string }[] };
      try {
        payload = JSON.parse(readFileSync(join(dir, file), "utf-8"));
      } catch {
        continue;
      }
      for (const f of payload.flights ?? []) {
        const id = f.fr24_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        scannedUnique++;
        if (rank !== undefined) {
          const rec = perAirport.get(icao) ?? { rank, total: 0, rem: 0 };
          rec.total++;
          if (!done.has(id)) rec.rem++;
          perAirport.set(icao, rec);
        }
        if (done.has(id)) continue;
        totalRemaining++;
        if (rank !== undefined) {
          const b = camp.batches.find(
            (x) => rank >= x.ranks[0] && rank <= x.ranks[1],
          );
          if (b) remainingByBatch.set(b.id, remainingByBatch.get(b.id)! + 1);
        }
      }
    }
  }
}
const doneNow = camp.target_total - totalRemaining;
const pct =
  camp.target_total > 0 ? ((doneNow / camp.target_total) * 100).toFixed(1) : "0";
const current =
  camp.batches.find((b) => (remainingByBatch.get(b.id) ?? 0) > 0) ?? null;

// ── --batch N：列出該批有哪些機場 + 各自進度，然後結束 ──
if (batchArg !== null) {
  const b = camp.batches.find((x) => x.id === batchArg);
  if (!b) {
    console.log(`找不到 Batch ${batchArg}（有效：1-${camp.batches.length}）`);
    process.exit(1);
  }
  const rows = [...perAirport.entries()]
    .filter(([, v]) => v.rank >= b.ranks[0] && v.rank <= b.ranks[1])
    .sort((x, y) => x[1].rank - y[1].rank);
  console.log(
    `\n=== Batch ${b.id}（rank ${b.ranks[0]}-${b.ranks[1]}）機場清單 @ ${today} ===\n`,
  );
  console.log(
    `※「剩/總」＝從該機場「起飛」的航班；實際抓取 orig 或 dest 命中會更多，以 --dry-run 為準\n`,
  );
  console.log(`rank  ICAO  IATA    剩 /  總   機場`);
  let sr = 0;
  let st = 0;
  for (const [icao, v] of rows) {
    const info = infoOf.get(icao);
    sr += v.rem;
    st += v.total;
    const left = `${String(v.rank).padStart(4)}  ${icao}  ${(info?.iata ?? "").padEnd(4)}  ${String(v.rem).padStart(5)}/${String(v.total).padStart(5)}`;
    console.log(`${left}  ${info?.name ?? ""}`);
  }
  console.log(
    `\n小計：${rows.length} 座｜剩 ${fmt(sr)} / 總 ${fmt(st)} 條（出發歸屬）`,
  );
  console.log();
  process.exit(0);
}

// 5) 本週期額度（手動錨 − 帳本已花）
const anchor = camp.budget.manual_remaining_as_of;
let spentSinceAnchor = 0;
let sessionCount = 0;
if (existsSync(SESSIONS_NDJSON)) {
  for (const line of readFileSync(SESSIONS_NDJSON, "utf-8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try {
      const rec = JSON.parse(s) as { ts: string; credits_est: number };
      if (rec.ts.slice(0, 10) >= anchor) {
        spentSinceAnchor += rec.credits_est;
        sessionCount++;
      }
    } catch {
      /* skip */
    }
  }
}
const remainingCredits = Math.max(
  0,
  camp.budget.manual_remaining - spentSinceAnchor,
);
const cap = Math.floor(remainingCredits * 0.95); // 留 5% 餘裕
const canFetch = Math.floor(cap / CPT);

// 6) 漂移偵測
const doneCount = done.size;
const drift: string[] = [];
if (existsSync(MANIFEST_FILE)) {
  const man = JSON.parse(readFileSync(MANIFEST_FILE, "utf-8")) as {
    totalFlights: number;
  };
  if (doneCount - man.totalFlights > 500) {
    drift.push(
      `track-done (${fmt(doneCount)}) 比 manifest (${fmt(man.totalFlights)}) 多 ${fmt(doneCount - man.totalFlights)} → 有軌跡沒入帳，先跑 split-tracks.ts`,
    );
  }
  if (
    existsSync(UPLOAD_STATE) &&
    statSync(MANIFEST_FILE).mtimeMs > statSync(UPLOAD_STATE).mtimeMs
  ) {
    drift.push(`manifest 比 upload-state 新 → 本地還沒上 S3，記得 npm run s3:upload`);
  }
}

// ── 輸出 ──
console.log(`\n=== 🌐 Top-1000 軌跡戰役 @ ${today} ===\n`);
console.log(`目標日   : ${camp.date}（台北整日）`);
console.log(
  `總進度   : ${fmt(doneNow)} / ${fmt(camp.target_total)} 條 (${pct}%)｜還剩 ${fmt(totalRemaining)} 條`,
);
console.log(`掃描基數 : ${fmt(scannedUnique)} 條不重複航班（前 1000 座起飛）\n`);

console.log(`各批剩餘（按出發機場 rank；實際 todo 以 --dry-run 為準）：`);
for (const b of camp.batches) {
  const rem = remainingByBatch.get(b.id) ?? 0;
  const mark =
    current && current.id === b.id ? " ← 目前批次" : rem === 0 ? " ✅ 完成" : "";
  console.log(
    `  Batch ${b.id} rank ${b.ranks[0]}-${b.ranks[1]}: 剩 ${fmt(rem)}${mark}`,
  );
}
console.log(
  `  （看某批有哪些機場：npx tsx scripts/campaign-status.ts --batch <N>）`,
);

console.log(`\n本期核准額度（@ ${anchor}，由你啟動時確認）：`);
console.log(
  `  核准 ${fmt(camp.budget.manual_remaining)}｜帳本已花 ${fmt(spentSinceAnchor)}（${sessionCount} 次）｜估還剩 ~${fmt(remainingCredits)} ≈ ${fmt(canFetch)} 條`,
);
console.log(
  `  ※ 每次花多少先跟你確認；額度用完或換月，更新 campaign-top1000.json 的 budget.manual_remaining / as_of`,
);

if (drift.length) {
  console.log(`\n⚠️  漂移警告（先處理再抓）：`);
  for (const d of drift) console.log(`  [!] ${d}`);
} else {
  console.log(`\n✅ 無漂移（manifest 已入帳、S3 已同步）`);
}

console.log(`\n建議指令：`);
if (!current) {
  console.log(`  🎉 全部 ${fmt(camp.target_total)} 條抓完了！`);
} else if (canFetch <= 0) {
  console.log(
    `  本週期額度用盡（或錨點需更新）。額度重置後更新 campaign-top1000.json 的 manual_remaining / as_of，再跑。`,
  );
} else {
  console.log(`  npx tsx scripts/fetch-tracks.ts \\`);
  console.log(
    `    --airports-file ${camp.airports_file} --rank ${current.ranks[0]}-${current.ranks[1]} \\`,
  );
  console.log(`    --date ${camp.date} --max-credits ${cap}`);
  console.log(
    `  （先加 --dry-run 看實際 todo；跑完照 /track-round「Top-1000 P2」收尾）`,
  );
}
console.log();
