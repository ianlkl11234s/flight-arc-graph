import type { TrailPoint } from "../types";

/**
 * 根據時間插值取得軌跡上的位置
 * 回傳 [lat, lng, alt_m] 或 null（如果時間超出範圍）
 */
export function interpolatePosition(
  path: TrailPoint[],
  time: number,
): [number, number, number] | null {
  if (path.length === 0) return null;

  const first = path[0]!;
  const last = path[path.length - 1]!;

  if (time <= first[3]) return [first[0], first[1], first[2]];
  if (time >= last[3]) return [last[0], last[1], last[2]];

  // 找到時間區間
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    if (time >= a[3] && time <= b[3]) {
      const t = (time - a[3]) / (b[3] - a[3]);
      return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ];
    }
  }

  return null;
}

/**
 * 取得到指定時間為止的軌跡段
 * 頭尾皆做插值，確保軌跡長度隨時間平滑變化
 */
export function getTrailUpToTime(
  path: TrailPoint[],
  time: number,
  maxTrailDuration: number = 300,
): TrailPoint[] {
  const cutoffTime = time - maxTrailDuration;
  const result: TrailPoint[] = [];

  // 找出 cutoff 之後的第一個點的索引
  let startIdx = 0;
  while (startIdx < path.length && path[startIdx]![3] < cutoffTime) {
    startIdx++;
  }

  // 尾端插值：如果 cutoff 落在兩點之間，插入精確的 cutoff 位置
  if (startIdx > 0 && startIdx < path.length) {
    const tailPos = interpolatePosition(path, cutoffTime);
    if (tailPos) {
      result.push([tailPos[0], tailPos[1], tailPos[2], cutoffTime]);
    }
  }

  // 收集 cutoff 之後、time 之前的所有原始點
  for (let i = startIdx; i < path.length; i++) {
    if (path[i]![3] > time) break;
    result.push(path[i]!);
  }

  // 頭端插值：加入當前時間的精確位置
  const headPos = interpolatePosition(path, time);
  if (headPos && result.length > 0) {
    const lastTime = result[result.length - 1]![3];
    if (time > lastTime) {
      result.push([headPos[0], headPos[1], headPos[2], time]);
    }
  }

  return result;
}

/**
 * 判斷航班在指定時間是否在飛行中
 */
export function isFlightActive(path: TrailPoint[], time: number): boolean {
  if (path.length === 0) return false;
  return time >= path[0]![3] && time <= path[path.length - 1]![3];
}
