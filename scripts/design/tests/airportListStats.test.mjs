// node --import tsx --test scripts/design/tests/airportListStats.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectiveDates, getArrDep, getTotal, getTotalOrNull, nextSort, parseSort, serializeSort, sortAirports } from "../../../src/data/airportListStats.ts";

const KATL = { flights: 2000, dates: { "2026-02-18": 1870, "2026-02-19": 100 }, datesArr: { "2026-02-18": 966, "2026-02-19": 50 }, datesDep: { "2026-02-18": 904, "2026-02-19": 50 } };
const OLD = { flights: 500, dates: { "2026-02-18": 500 } }; // 舊 manifest：沒有 datesArr / datesDep
const ZERO = { flights: 10, dates: { "2026-02-18": 10 }, datesArr: { "2026-02-18": 0 }, datesDep: { "2026-02-18": 10 } };

describe("effectiveDates", () => {
  it("單日", () => assert.deepEqual(effectiveDates("2026-02-18", 1), ["2026-02-18"]));
  it("3d 連續日期（跨月）", () => assert.deepEqual(effectiveDates("2026-02-27", 3), ["2026-02-27", "2026-02-28", "2026-03-01"]));
  it("Compare 多日優先、去重排序", () => assert.deepEqual(effectiveDates("2026-02-18", 3, ["2026-03-02", "2026-02-18", "2026-02-18"]), ["2026-02-18", "2026-03-02"]));
  it("無日期 → 空", () => assert.deepEqual(effectiveDates(null, 1), []));
});

describe("getArrDep（R9：缺值不是 0）", () => {
  it("單日", () => assert.deepEqual(getArrDep(KATL, ["2026-02-18"]), { arr: 966, dep: 904 }));
  it("多日加總", () => assert.deepEqual(getArrDep(KATL, ["2026-02-18", "2026-02-19"]), { arr: 1016, dep: 954 }));
  it("舊 manifest → null", () => assert.deepEqual(getArrDep(OLD, ["2026-02-18"]), { arr: null, dep: null }));
  it("該日沒資料 → null", () => assert.deepEqual(getArrDep(KATL, ["2026-03-01"]), { arr: null, dep: null }));
  it("真的是 0 要保留 0", () => assert.deepEqual(getArrDep(ZERO, ["2026-02-18"]), { arr: 0, dep: 10 }));
  it("沒有 entry／沒選日期 → null", () => {
    assert.deepEqual(getArrDep(undefined, ["2026-02-18"]), { arr: null, dep: null });
    assert.deepEqual(getArrDep(KATL, []), { arr: null, dep: null });
  });
});

describe("getTotal 不用 arr+dep", () => {
  it("用 dates 加總", () => assert.equal(getTotal(KATL, ["2026-02-18"]), 1870));
  it("沒選日期 → flights", () => assert.equal(getTotal(KATL, []), 2000));
  it("該日沒資料 → 0", () => assert.equal(getTotal(KATL, ["2026-03-01"]), 0));
});

describe("getTotalOrNull（顯示用，R9）", () => {
  it("用 dates 加總", () => assert.equal(getTotalOrNull(KATL, ["2026-02-18"]), 1870));
  it("該日沒資料 → null", () => assert.equal(getTotalOrNull(KATL, ["2026-03-01"]), null));
  it("沒選日期 → flights", () => assert.equal(getTotalOrNull(KATL, []), 2000));
  it("沒有 entry → null", () => assert.equal(getTotalOrNull(undefined, ["2026-02-18"]), null));
});

describe("排序狀態（欄首點擊、localStorage 遷移）", () => {
  it("舊值只有 key → 該欄預設方向", () => {
    assert.deepEqual(parseSort("tot"), { key: "tot", dir: "desc" });
    assert.deepEqual(parseSort("arr"), { key: "arr", dir: "desc" });
    assert.deepEqual(parseSort("name"), { key: "name", dir: "asc" });
  });
  it("新格式 key:dir", () => assert.deepEqual(parseSort("dep:asc"), { key: "dep", dir: "asc" }));
  it("壞值 → 總量由大到小", () => {
    assert.deepEqual(parseSort(null), { key: "tot", dir: "desc" });
    assert.deepEqual(parseSort("xx:asc"), { key: "tot", dir: "desc" });
    assert.deepEqual(parseSort("arr:up"), { key: "arr", dir: "desc" });
  });
  it("序列化可往返", () => assert.deepEqual(parseSort(serializeSort({ key: "name", dir: "desc" })), { key: "name", dir: "desc" }));
  it("換欄 → 預設方向；同欄 → 反向", () => {
    assert.deepEqual(nextSort({ key: "tot", dir: "desc" }, "arr"), { key: "arr", dir: "desc" });
    assert.deepEqual(nextSort({ key: "arr", dir: "desc" }, "arr"), { key: "arr", dir: "asc" });
    assert.deepEqual(nextSort({ key: "arr", dir: "asc" }, "arr"), { key: "arr", dir: "desc" });
    assert.deepEqual(nextSort({ key: "tot", dir: "desc" }, "name"), { key: "name", dir: "asc" });
  });
});

describe("sortAirports", () => {
  const catalog = { KATL, OLD1: OLD, ZERO1: ZERO, NONE: { flights: 0 } };
  const names = { KATL: "亞特蘭大", OLD1: "舊站", ZERO1: "零進場", NONE: "無軌跡" };
  const ctx = {
    catalog,
    dates: ["2026-02-18"],
    nameOf: (i) => names[i] ?? i,
    available: new Set(["KATL", "OLD1", "ZERO1"]),
  };
  const ids = ["NONE", "ZERO1", "OLD1", "KATL"];
  it("總量由大到小，無軌跡殿後", () => assert.deepEqual(sortAirports(ids, "tot", ctx), ["KATL", "OLD1", "ZERO1", "NONE"]));
  it("進場：缺值排在 0 之後", () => assert.deepEqual(sortAirports(ids, "arr", ctx), ["KATL", "ZERO1", "OLD1", "NONE"]));
  it("離場", () => assert.deepEqual(sortAirports(ids, "dep", ctx), ["KATL", "ZERO1", "OLD1", "NONE"]));
  it("名稱 zh-Hant 升冪", () => {
    const out = sortAirports(ids, "name", ctx);
    assert.equal(out[out.length - 1], "NONE");
    assert.deepEqual([...out.slice(0, 3)].sort(), ["KATL", "OLD1", "ZERO1"]);
  });
  it("總量反向：由小到大，無軌跡仍殿後", () => assert.deepEqual(sortAirports(ids, "tot", ctx, "asc"), ["ZERO1", "OLD1", "KATL", "NONE"]));
  it("進場反向：缺值仍排在有值之後", () => assert.deepEqual(sortAirports(ids, "arr", ctx, "asc"), ["ZERO1", "KATL", "OLD1", "NONE"]));
  it("名稱反向 = 升冪反轉（無軌跡仍殿後）", () => {
    const asc = sortAirports(ids, "name", ctx, "asc").slice(0, 3);
    const desc = sortAirports(ids, "name", ctx, "desc");
    assert.deepEqual(desc.slice(0, 3), [...asc].reverse());
    assert.equal(desc[3], "NONE");
  });
  it("dir 省略 = 預設方向", () => assert.deepEqual(sortAirports(ids, "arr", ctx), sortAirports(ids, "arr", ctx, "desc")));
  it("不改動輸入", () => {
    const copy = [...ids];
    sortAirports(ids, "tot", ctx);
    assert.deepEqual(ids, copy);
  });
});
