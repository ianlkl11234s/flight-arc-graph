import type { Flight } from "../types";

const BUCKET_SIZE = 60; // 每 60 秒一個 bucket

/**
 * 時間索引：將航班按活躍時段分桶
 * 查詢 O(1) 取代 O(N) 全量遍歷
 */
export class FlightTimeIndex {
  private buckets = new Map<number, number[]>();
  private flights: Flight[] = [];

  build(flights: Flight[]) {
    this.flights = flights;
    this.buckets.clear();

    for (let i = 0; i < flights.length; i++) {
      const f = flights[i]!;
      if (f.path.length === 0) continue;

      const startBucket = Math.floor(f.path[0]![3] / BUCKET_SIZE);
      const endBucket = Math.floor(f.path[f.path.length - 1]![3] / BUCKET_SIZE);

      for (let b = startBucket; b <= endBucket; b++) {
        let arr = this.buckets.get(b);
        if (!arr) {
          arr = [];
          this.buckets.set(b, arr);
        }
        arr.push(i);
      }
    }
  }

  /**
   * 取得指定時間活躍的航班
   * 回傳去重後的 Flight 陣列
   */
  getActiveFlights(time: number): Flight[] {
    const bucket = Math.floor(time / BUCKET_SIZE);
    const indices = this.buckets.get(bucket);
    if (!indices) return [];

    const result: Flight[] = [];
    for (const idx of indices) {
      const f = this.flights[idx]!;
      // 精確檢查：bucket 是粗篩，還需確認時間在 path 範圍內
      const start = f.path[0]![3];
      const end = f.path[f.path.length - 1]![3];
      if (time >= start && time <= end) {
        result.push(f);
      }
    }
    return result;
  }

  get size() {
    return this.flights.length;
  }
}
