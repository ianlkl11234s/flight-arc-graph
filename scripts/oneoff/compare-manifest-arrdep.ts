/**
 * compare-manifest-arrdep.ts — 一次性驗證：split-tracks 加 arr/dep 後重建的 manifest
 * 與舊版在既有欄位上完全相同（只多出新欄位）。
 *
 * 比對：totalFlights、regions、regionDates、regionFullDates、airports 集合、
 *       每機場 flights / gzipBytes / isCore / dates / fullDates、dailyFiles 去掉 arr/dep 後。
 * 另檢查新欄位：datesArr/datesDep key 集合 == dates，dailyFiles[d].arr/dep == datesArr/datesDep[d]。
 *
 * Usage: npx tsx scripts/oneoff/compare-manifest-arrdep.ts <old.json> <new.json> [ICAO:DATE ...]
 */
import { readFileSync } from "fs";

const [oldPath, newPath, ...samples] = process.argv.slice(2);
if (!oldPath || !newPath) {
  console.error("usage: compare-manifest-arrdep.ts <old.json> <new.json> [ICAO:DATE ...]");
  process.exit(2);
}
const oldM = JSON.parse(readFileSync(oldPath, "utf-8"));
const newM = JSON.parse(readFileSync(newPath, "utf-8"));

const diffs: string[] = [];
const same = (label: string, a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(label);
};

for (const k of ["totalFlights", "regions", "regionDates", "regionFullDates"]) same(k, oldM[k], newM[k]);
same("airports.keys", Object.keys(oldM.airports).sort(), Object.keys(newM.airports).sort());

const newFieldIssues: string[] = [];
for (const [icao, o] of Object.entries<any>(oldM.airports)) {
  const n = newM.airports[icao];
  if (!n) continue;
  for (const k of ["flights", "gzipBytes", "isCore", "dates", "fullDates"]) same(`${icao}.${k}`, o[k], n[k]);
  // dailyFiles 的日期 key 順序：完整模式按日期排序、--manifest-only 依航班順序插入，
  // 語意無差，比對時先排序 key（其餘欄位維持嚴格順序比對）。
  const canon = (df: any, dropNew: boolean) =>
    df &&
    Object.fromEntries(
      Object.entries<any>(df)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([d, meta]) => {
          if (!dropNew) return [d, meta];
          const { arr: _a, dep: _d, ...rest } = meta;
          return [d, rest];
        }),
    );
  same(`${icao}.dailyFiles`, canon(o.dailyFiles, false), canon(n.dailyFiles, true));

  const dk = JSON.stringify(Object.keys(n.dates ?? {}));
  if (JSON.stringify(Object.keys(n.datesArr ?? {})) !== dk) newFieldIssues.push(`${icao}.datesArr keys`);
  if (JSON.stringify(Object.keys(n.datesDep ?? {})) !== dk) newFieldIssues.push(`${icao}.datesDep keys`);
  for (const [d, meta] of Object.entries<any>(n.dailyFiles ?? {})) {
    if (meta.arr !== n.datesArr?.[d] || meta.dep !== n.datesDep?.[d]) newFieldIssues.push(`${icao}.dailyFiles.${d} arr/dep`);
  }
}

// arr + dep vs flights 統計（不是錯誤，照實記錄）
let lt = 0;
let gt = 0;
let cells = 0;
for (const n of Object.values<any>(newM.airports)) {
  for (const [d, f] of Object.entries<number>(n.dates ?? {})) {
    cells++;
    const s = n.datesArr[d] + n.datesDep[d];
    if (s < f) lt++;
    else if (s > f) gt++;
  }
}

console.log(`既有欄位差異數: ${diffs.length}`);
for (const d of diffs.slice(0, 20)) console.log(`  - ${d}`);
console.log(`新欄位一致性問題: ${newFieldIssues.length}`);
for (const d of newFieldIssues.slice(0, 20)) console.log(`  - ${d}`);
console.log(`機場×日期格: ${cells}；arr+dep < flights: ${lt}；arr+dep > flights: ${gt}`);
for (const s of samples) {
  const [icao, date] = s.split(":");
  const n = newM.airports[icao];
  console.log(`${icao} ${date}: flights=${n?.dates?.[date]} arr=${n?.datesArr?.[date]} dep=${n?.datesDep?.[date]}`);
}
process.exit(diffs.length || newFieldIssues.length ? 1 : 0);
