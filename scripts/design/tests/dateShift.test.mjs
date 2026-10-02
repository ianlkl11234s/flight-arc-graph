// node --import tsx --test scripts/design/tests/dateShift.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { shiftToAvailableDate } from "../../../src/data/dateShift.ts";

const dates = ["2026-02-10", "2026-02-18", "2026-03-01", "2026-07-11"];

describe("時間軸 ◀ ▶ 前／後一個有資料的日期（R12）", () => {
  it("在清單內：前一個／後一個", () => {
    assert.equal(shiftToAvailableDate(dates, "2026-02-18", -1), "2026-02-10");
    assert.equal(shiftToAvailableDate(dates, "2026-02-18", 1), "2026-03-01");
  });

  it("碰到頭尾不動（回 null）", () => {
    assert.equal(shiftToAvailableDate(dates, "2026-02-10", -1), null);
    assert.equal(shiftToAvailableDate(dates, "2026-07-11", 1), null);
  });

  it("不在清單內：往該方向找最近的有資料日期（不再一律跳到最後一天）", () => {
    assert.equal(shiftToAvailableDate(dates, "2026-02-20", -1), "2026-02-18");
    assert.equal(shiftToAvailableDate(dates, "2026-02-20", 1), "2026-03-01");
  });

  it("不在清單內且該方向沒有資料 → null", () => {
    assert.equal(shiftToAvailableDate(dates, "2026-01-01", -1), null);
    assert.equal(shiftToAvailableDate(dates, "2026-12-31", 1), null);
    assert.equal(shiftToAvailableDate(dates, "2026-01-01", 1), "2026-02-10");
  });

  it("空清單、delta 0 → null", () => {
    assert.equal(shiftToAvailableDate([], "2026-02-18", 1), null);
    assert.equal(shiftToAvailableDate(dates, "2026-02-18", 0), null);
  });
});
