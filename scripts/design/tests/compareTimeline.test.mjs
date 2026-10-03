// node --import tsx --test scripts/design/tests/compareTimeline.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareProgressToTime, compareSegmentStarts, compareTimeToProgress, DAY_SEC } from "../../../src/ui/compareTimeline.ts";

const D18 = Date.UTC(2026, 1, 18) / 1000 - 8 * 3600; // 2026-02-18 00:00 台灣
const D24 = Date.UTC(2026, 1, 24) / 1000 - 8 * 3600;
const D05 = Date.UTC(2026, 2, 5) / 1000 - 8 * 3600;

describe("compareSegmentStarts", () => {
  it("日期升冪、去重（與選取順序無關）", () => {
    assert.deepEqual(compareSegmentStarts(["2026-03-05", "2026-02-18", "2026-02-24", "2026-02-18"]), [D18, D24, D05]);
  });
  it("空 → 空", () => assert.deepEqual(compareSegmentStarts([]), []));
});

describe("compareTimeToProgress（三段等寬）", () => {
  const s = [D18, D24, D05];
  it("各段起點", () => {
    assert.equal(compareTimeToProgress(D18, s), 0);
    assert.equal(compareTimeToProgress(D24, s), 1 / 3);
    assert.equal(compareTimeToProgress(D05, s), 2 / 3);
  });
  it("段內中午 = 段中點", () => assert.equal(compareTimeToProgress(D24 + DAY_SEC / 2, s), 0.5));
  it("空檔日釘在前一段末端", () => assert.equal(compareTimeToProgress(D18 + 3 * DAY_SEC, s), 1 / 3));
  it("早於第一段 → 0；晚於最後一段 → 1", () => {
    assert.equal(compareTimeToProgress(D18 - 10, s), 0);
    assert.equal(compareTimeToProgress(D05 + 2 * DAY_SEC, s), 1);
  });
  it("沒有段 → 0", () => assert.equal(compareTimeToProgress(D18, []), 0));
});

describe("compareProgressToTime", () => {
  const s = [D18, D24, D05];
  it("段界 → 下一段起點", () => {
    assert.equal(compareProgressToTime(0, s), D18);
    assert.equal(compareProgressToTime(1 / 3, s), D24);
    assert.equal(compareProgressToTime(2 / 3, s), D05);
  });
  it("1 → 最後一段最後一秒", () => assert.equal(compareProgressToTime(1, s), D05 + DAY_SEC - 1));
  it("超出範圍夾住", () => {
    assert.equal(compareProgressToTime(-1, s), D18);
    assert.equal(compareProgressToTime(2, s), D05 + DAY_SEC - 1);
  });
  it("往返一致（段內時刻）", () => {
    for (const t of [D18 + 3600, D24 + 12345, D05 + 80000]) {
      assert.equal(compareProgressToTime(compareTimeToProgress(t, s), s), t);
    }
  });
});
