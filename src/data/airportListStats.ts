/**
 * 機場列表的「進／離」數字欄與排序（純函式）。
 *
 * 資料來自 manifest 每機場的 datesArr / datesDep（key = 台灣日期）。
 * R9：缺值不是 0 —— 舊 manifest 沒這兩欄、或所選日期都沒資料 → null（UI 顯示「—」）。
 * 總量用 flights / dates[date]，不用 arr + dep（兩者不一定相等）。
 */
import type { AirportManifestEntry } from "./flightLoader";

export type AirportSortKey = "tot" | "arr" | "dep" | "name";

export const AIRPORT_SORT_KEYS: readonly AirportSortKey[] = ["tot", "arr", "dep", "name"];

export type SortDir = "asc" | "desc";

/** 欄首排序狀態：哪一欄、哪個方向 */
export interface AirportSort {
  key: AirportSortKey;
  dir: SortDir;
}

/** 預設方向：數字欄由大到小，名稱升冪 */
export function defaultSortDir(key: AirportSortKey): SortDir {
  return key === "name" ? "asc" : "desc";
}

/** 點欄首：換欄 → 該欄預設方向；同欄 → 反向 */
export function nextSort(cur: AirportSort, key: AirportSortKey): AirportSort {
  if (cur.key !== key) return { key, dir: defaultSortDir(key) };
  return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
}

/** localStorage 值 → 排序狀態。新格式 `key:dir`；舊值只有 key（tot/arr/dep/name）→ 該欄預設方向；壞值 → 總量由大到小 */
export function parseSort(raw: string | null | undefined): AirportSort {
  const [k, d] = (raw ?? "").split(":");
  if (!AIRPORT_SORT_KEYS.includes(k as AirportSortKey)) return { key: "tot", dir: "desc" };
  const key = k as AirportSortKey;
  return { key, dir: d === "asc" || d === "desc" ? d : defaultSortDir(key) };
}

export function serializeSort(s: AirportSort): string {
  return `${s.key}:${s.dir}`;
}

export interface ArrDepCount {
  arr: number | null;
  dep: number | null;
}

type StatsEntry = Pick<AirportManifestEntry, "flights" | "dates" | "datesArr" | "datesDep">;

/** 目前生效的日期：Compare 多日 → selectedDates；否則 selectedDate 起連續 rangeDays 天。 */
export function effectiveDates(
  selectedDate: string | null,
  rangeDays: number,
  selectedDates: readonly string[] = [],
): string[] {
  if (selectedDates.length > 0) return [...new Set(selectedDates)].sort();
  if (!selectedDate) return [];
  const [y, m, d] = selectedDate.split("-").map(Number);
  if (!y || !m || !d) return [selectedDate];
  const out: string[] = [];
  for (let i = 0; i < Math.max(1, rangeDays); i++) {
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
  }
  return out;
}

function sumOver(map: Record<string, number> | undefined, dates: readonly string[]): number | null {
  if (!map) return null;
  let sum = 0;
  let hit = false;
  for (const date of dates) {
    const v = map[date];
    if (typeof v === "number") {
      sum += v;
      hit = true;
    }
  }
  return hit ? sum : null;
}

/** 所選日期的進／離場數；沒有欄位或沒有任何一天有資料 → null（不是 0）。 */
export function getArrDep(entry: StatsEntry | undefined, dates: readonly string[]): ArrDepCount {
  if (!entry || dates.length === 0) return { arr: null, dep: null };
  return { arr: sumOver(entry.datesArr, dates), dep: sumOver(entry.datesDep, dates) };
}

/** 總量（顯示用）：dates 加總；沒有任何一天有資料 → null（顯示「—」，R9）；沒選日期 → 全期 flights。 */
export function getTotalOrNull(entry: StatsEntry | undefined, dates: readonly string[]): number | null {
  if (!entry) return null;
  if (dates.length === 0) return entry.flights ?? null;
  return sumOver(entry.dates, dates);
}

/** 總量（排序用）：有日期 → dates 加總（沒資料 = 0）；沒選日期 → 全期 flights。 */
export function getTotal(entry: StatsEntry | undefined, dates: readonly string[]): number {
  if (!entry) return 0;
  if (dates.length === 0) return entry.flights ?? 0;
  return sumOver(entry.dates, dates) ?? 0;
}

export interface AirportSortContext {
  catalog: Record<string, StatsEntry>;
  dates: readonly string[];
  /** 名稱排序用的顯示名 */
  nameOf: (icao: string) => string;
  /** 有軌跡的機場排前面 */
  available: ReadonlySet<string>;
}

/**
 * 排序（不改動輸入）：有軌跡者在前；數字欄預設由大到小，缺值（null）不論方向都排在有值之後；
 * 同分以全期 flights、ICAO 決勝。name = 顯示名 zh-Hant 升冪。dir 省略 = 該欄預設方向。
 */
export function sortAirports(
  icaos: readonly string[],
  key: AirportSortKey,
  ctx: AirportSortContext,
  dir: SortDir = defaultSortDir(key),
): string[] {
  const sign = dir === defaultSortDir(key) ? 1 : -1;
  const value = (icao: string): number => {
    const entry = ctx.catalog[icao];
    if (key === "tot") return getTotal(entry, ctx.dates);
    const v = getArrDep(entry, ctx.dates)[key === "arr" ? "arr" : "dep"];
    return v ?? -1;
  };
  return [...icaos].sort((a, b) => {
    const avail = Number(ctx.available.has(b)) - Number(ctx.available.has(a));
    if (avail) return avail;
    if (key === "name") {
      return sign * (ctx.nameOf(a).localeCompare(ctx.nameOf(b), "zh-Hant") || a.localeCompare(b));
    }
    const va = value(a);
    const vb = value(b);
    // 缺值（-1）固定殿後，不隨方向翻轉
    if ((va < 0) !== (vb < 0)) return va < 0 ? 1 : -1;
    return (
      sign * (vb - va) ||
      (ctx.catalog[b]?.flights ?? 0) - (ctx.catalog[a]?.flights ?? 0) ||
      a.localeCompare(b)
    );
  });
}
