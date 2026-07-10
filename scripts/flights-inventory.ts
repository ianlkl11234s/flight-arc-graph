/**
 * 航班庫存視圖 — 「倉庫裡有什麼、補齊各要多少錢」的決策指令
 *
 *   npx tsx scripts/flights-inventory.ts                 # 全部機場 Top 30（按時刻表筆數）
 *   npx tsx scripts/flights-inventory.ts --group TW      # 只看某機場群
 *   npx tsx scripts/flights-inventory.ts --airports RCTP,RCSS
 *   npx tsx scripts/flights-inventory.ts --all           # 不截斷，列出全部
 *
 * 讀 scripts/flight-list.json（時刻表超集）+ scripts/track-done.ndjson（已抓軌跡），
 * 每座機場印：時刻表筆數、涵蓋日期範圍、已抓軌跡數、軌跡缺口、補完 credits（缺口×40）。
 * 機場歸屬 = orig 或 dest 命中（與 fetch-tracks 篩選一致），故各列小計會重複計；
 * 「合計」以 fr24_id 聯集去重，才是補齊該群的實際筆數 / credits。
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const INPUT_FILE = resolve(ROOT, "scripts/flight-list.json");
const DONE_NDJSON = resolve(ROOT, "scripts/track-done.ndjson");
const GROUPS_FILE = resolve(ROOT, "scripts/airport-groups.json");
const TOP1000_FILE = resolve(ROOT, "scripts/top1000-airports.json");

const CREDITS_PER_TRACK = 40;
const DEFAULT_TOP = 30;

const fmt = (n: number) => n.toLocaleString("en-US");

interface Flight {
  fr24_id: string;
  orig_icao: string;
  dest_icao: string;
  datetime_takeoff?: string;
  first_seen?: string;
}

// ── 參數 ──
const get = (k: string): string | null => {
  const i = process.argv.indexOf(k);
  return i !== -1 ? process.argv[i + 1]! : null;
};

function loadGroup(name: string): string[] {
  if (!existsSync(GROUPS_FILE)) {
    console.error(`❌ 找不到 ${GROUPS_FILE}`);
    process.exit(1);
  }
  const groups = JSON.parse(readFileSync(GROUPS_FILE, "utf-8")) as Record<
    string,
    unknown
  >;
  const list = groups[name];
  if (!Array.isArray(list)) {
    const avail = Object.keys(groups)
      .filter((k) => Array.isArray(groups[k]))
      .join(", ");
    console.error(`❌ 找不到 group "${name}"，可用: ${avail}`);
    process.exit(1);
  }
  return (list as string[]).map((s) => String(s).toUpperCase());
}

const groupName = get("--group");
const airportsArg = get("--airports");
const showAll = process.argv.includes("--all");

const groupFilter = groupName ? new Set(loadGroup(groupName)) : null;
const inlineFilter = airportsArg
  ? new Set(airportsArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
  : null;
const explicitFilter = groupFilter ?? inlineFilter; // 明確指定機場（含全展開，不截斷）

// ── 讀時刻表 ──
if (!existsSync(INPUT_FILE)) {
  console.error(`❌ 找不到 ${INPUT_FILE}`);
  process.exit(1);
}
const inputData = JSON.parse(readFileSync(INPUT_FILE, "utf-8"));
const flights: Flight[] = inputData.flights ?? inputData;

// ── 讀已抓軌跡 ──
const done = new Set<string>();
if (existsSync(DONE_NDJSON)) {
  for (const line of readFileSync(DONE_NDJSON, "utf-8").split("\n")) {
    const id = line.trim();
    if (id) done.add(id);
  }
}

// ── IATA / 名稱 enrichment（可選）──
const infoOf = new Map<string, { iata: string; name: string }>();
if (existsSync(TOP1000_FILE)) {
  const rawTop = JSON.parse(readFileSync(TOP1000_FILE, "utf-8"));
  const list: { icao: string; iata?: string; name?: string }[] = Array.isArray(
    rawTop,
  )
    ? rawTop
    : rawTop.airports ?? [];
  for (const a of list)
    infoOf.set(a.icao, { iata: a.iata ?? "", name: a.name ?? "" });
}

// ── 各機場歸屬（orig 或 dest 命中）──
interface Row {
  ids: Set<string>; // 該機場的 fr24_id（去重）
  minD: string;
  maxD: string;
}
const perAirport = new Map<string, Row>();
function touch(icao: string, id: string, date: string) {
  if (!icao) return;
  let r = perAirport.get(icao);
  if (!r) {
    r = { ids: new Set(), minD: "", maxD: "" };
    perAirport.set(icao, r);
  }
  r.ids.add(id);
  if (date) {
    if (!r.minD || date < r.minD) r.minD = date;
    if (!r.maxD || date > r.maxD) r.maxD = date;
  }
}
for (const f of flights) {
  const date = (f.datetime_takeoff || f.first_seen || "").slice(0, 10);
  touch(f.orig_icao, f.fr24_id, date);
  touch(f.dest_icao, f.fr24_id, date);
}

// ── 選取要顯示的機場 ──
let selected: string[];
if (explicitFilter) {
  // 明確指定 → 依指定集合，只保留有時刻表資料者
  selected = [...explicitFilter].filter((icao) => perAirport.has(icao));
} else {
  selected = [...perAirport.keys()];
}
// 按時刻表筆數 desc 排序
selected.sort(
  (a, b) => perAirport.get(b)!.ids.size - perAirport.get(a)!.ids.size,
);
const totalAirports = selected.length;
const truncated = !explicitFilter && !showAll && selected.length > DEFAULT_TOP;
if (truncated) selected = selected.slice(0, DEFAULT_TOP);

// ── 輸出 ──
const scope = groupName
  ? `group ${groupName}`
  : inlineFilter
    ? [...inlineFilter].join(",")
    : truncated
      ? `Top ${DEFAULT_TOP} / ${fmt(totalAirports)} 座`
      : `全部 ${fmt(totalAirports)} 座`;

console.log(`\n=== 📦 航班庫存視圖 @ ${new Date().toISOString().slice(0, 10)} ===\n`);
console.log(`範圍     : ${scope}`);
console.log(`時刻表源 : flight-list.json（${fmt(flights.length)} 筆）`);
console.log(`已抓軌跡 : track-done.ndjson（${fmt(done.size)} 筆，全域）\n`);
console.log(
  `※ 機場歸屬 = orig 或 dest 命中；各列會重複計，實際補齊數 / credits 看「合計（去重）」\n`,
);

console.log(
  `ICAO  IATA   時刻表   日期範圍                 已抓    缺口   補完credits`,
);
console.log(
  `----  ----  -------  ----------------------  ------  ------  -----------`,
);
for (const icao of selected) {
  const r = perAirport.get(icao)!;
  const total = r.ids.size;
  let doneN = 0;
  for (const id of r.ids) if (done.has(id)) doneN++;
  const gap = total - doneN;
  const credits = gap * CREDITS_PER_TRACK;
  const iata = (infoOf.get(icao)?.iata ?? "").padEnd(4);
  const range = r.minD === r.maxD ? r.minD : `${r.minD}~${r.maxD}`;
  console.log(
    `${icao}  ${iata}  ${String(total).padStart(7)}  ${range.padEnd(22)}  ` +
      `${String(doneN).padStart(6)}  ${String(gap).padStart(6)}  ${fmt(credits).padStart(11)}`,
  );
}

// ── 合計（去重）──
const unionIds = new Set<string>();
for (const icao of selected)
  for (const id of perAirport.get(icao)!.ids) unionIds.add(id);
let unionDone = 0;
for (const id of unionIds) if (done.has(id)) unionDone++;
const unionGap = unionIds.size - unionDone;
console.log(
  `\n合計（去重）：${fmt(selected.length)} 座｜時刻表 ${fmt(unionIds.size)}｜已抓 ${fmt(
    unionDone,
  )}｜缺口 ${fmt(unionGap)}｜補完 ~${fmt(unionGap * CREDITS_PER_TRACK)} credits`,
);
if (truncated)
  console.log(
    `（只顯示前 ${DEFAULT_TOP} 座；--all 看全部、--group / --airports 指定範圍）`,
  );
console.log();
