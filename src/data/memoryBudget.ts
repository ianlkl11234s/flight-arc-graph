import type { AirportManifestEntry, LodLevel } from "./flightLoader";

/**
 * 軌跡記憶體預算（render-performance-plan 2-3）。
 *
 * 載入前用 manifest 估點數，超過上限時依序：清快取 → 自動改用較粗的 LOD → 仍超過就停下來等使用者確認。
 * 絕不少載航班（Summary 數字會錯）。只管 airport scope／airport set：region scope 讀的是
 * 已精簡的 regions/*.jsonl，全球所有日期約 150 萬點，碰不到上限。
 *
 * 校準（2026-10-15，apac set L2→L0 增加 228 萬點）：JS typed array 42 B／點、renderer 程序
 * 115 B／點、GPU 程序 71 B／點，合計約 185 B／點。
 */
export const TRACK_POINT_BUDGET = 4_000_000;
export const EST_BYTES_PER_POINT = 185;

let budgetOverride: number | null = null;
/** DEV 驗收用（__flightArcDebug）：暫時改上限；null 還原。只影響之後的選擇變更 */
export function setTrackPointBudgetOverride(points: number | null): void {
  budgetOverride = points;
}
export function trackPointBudget(): number {
  return budgetOverride ?? TRACK_POINT_BUDGET;
}

/** L0 daily shard 平均每點 35 bytes（300 個隨機 shard 實測） */
const SHARD_BYTES_PER_L0_POINT = 35;
/** 沒有 daily shard 時用班數估：L0 平均每班約 600 點 */
const L0_POINTS_PER_FLIGHT = 600;
/** L1／L2 剩下的點數比例（同一批 shard 實測 0.208／0.091） */
const LOD_POINT_RATIO: Record<LodLevel, number> = { l0: 1, l1: 0.21, l2: 0.09 };
const LOD_ORDER: readonly LodLevel[] = ["l0", "l1", "l2"];

/**
 * L0 點數估計，拆成「有 daily shard（可換 LOD）」與「flat fallback（只有 L0）」兩部分。
 * 組合模式各機場互飛的航班會被算兩次（apac set 多估約 16%），偏保守。
 */
export interface PointEstimate {
  lodable: number;
  fixed: number;
}

export function estimateL0Points(
  airports: Record<string, AirportManifestEntry>,
  icaos: readonly string[],
  dates: readonly string[],
): PointEstimate {
  let lodable = 0;
  let fixed = 0;
  for (const icao of icaos) {
    const entry = airports[icao];
    if (!entry) continue;
    if (dates.length === 0) {
      fixed += entry.flights * L0_POINTS_PER_FLIGHT;
      continue;
    }
    // 與 loadAirportFlights 一致：所有日期都有 shard 才走 shard，否則整份 flat
    const shards = dates.map((date) => entry.dailyFiles?.[date]);
    if (shards.every((s) => s !== undefined)) {
      for (const s of shards) lodable += s!.bytes / SHARD_BYTES_PER_L0_POINT;
    } else {
      for (const date of dates) fixed += (entry.dates?.[date] ?? 0) * L0_POINTS_PER_FLIGHT;
    }
  }
  return { lodable, fixed };
}

export interface BudgetDecision {
  /** 實際要載入的 LOD（≥ requested 的粗細） */
  lod: LodLevel;
  /** 因預算改用比 requested 更粗的 LOD */
  capped: boolean;
  /** 連 L2 都超過上限 */
  over: boolean;
  /** 以 lod 載入的預估點數 */
  estPoints: number;
}

export function decideLod(requested: LodLevel, est: PointEstimate): BudgetDecision {
  const start = LOD_ORDER.indexOf(requested);
  for (let i = start; i < LOD_ORDER.length; i++) {
    const lod = LOD_ORDER[i]!;
    const estPoints = est.lodable * LOD_POINT_RATIO[lod] + est.fixed;
    if (estPoints <= trackPointBudget()) return { lod, capped: i > start, over: false, estPoints };
  }
  return {
    lod: "l2",
    capped: start < LOD_ORDER.length - 1,
    over: true,
    estPoints: est.lodable * LOD_POINT_RATIO.l2 + est.fixed,
  };
}

export function pointsToMB(points: number): number {
  return (points * EST_BYTES_PER_POINT) / 1048576;
}
