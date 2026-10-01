// node --import tsx --test scripts/design/tests/flightLoadError.test.mjs（npm run design:test）
// R6：載入失敗（候選全是網路錯誤／5xx）要丟 FlightLoadError；404／空檔仍是「沒資料」→ []。
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadAirportFlights, FlightLoadError } from "../../../src/data/flightLoader.ts";

const realFetch = globalThis.fetch;
let calls;
const useFetch = (fn) => {
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    return fn(String(url), init);
  };
};

describe("flightLoader 失敗與無資料分開（R6）", () => {
  beforeEach(() => { calls = []; });
  afterEach(() => { globalThis.fetch = realFetch; });

  it("所有候選 5xx → FlightLoadError", async () => {
    useFetch(() => new Response("boom", { status: 500 }));
    await assert.rejects(loadAirportFlights("ZZT1"), FlightLoadError);
    assert.ok(calls.length >= 3);
  });

  it("所有候選網路錯誤 → FlightLoadError", async () => {
    useFetch(() => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(loadAirportFlights("ZZT2"), FlightLoadError);
  });

  it("404（檔案不存在）→ []，不是錯誤", async () => {
    useFetch(() => new Response("nope", { status: 404 }));
    assert.deepEqual(await loadAirportFlights("ZZT3"), []);
  });

  it("前面 5xx、後面 404 → []（有候選回答了）", async () => {
    useFetch((url) => new Response("", { status: url.includes("amazonaws") ? 404 : 503 }));
    assert.deepEqual(await loadAirportFlights("ZZT4"), []);
  });

  it("失敗不寫快取：恢復後重試會重新抓", async () => {
    useFetch(() => new Response("boom", { status: 500 }));
    await assert.rejects(loadAirportFlights("ZZT5"), FlightLoadError);
    calls = [];
    useFetch(() => new Response("", { status: 200 }));
    assert.deepEqual(await loadAirportFlights("ZZT5"), []);
    assert.ok(calls.length > 0, "重試應該真的發出請求");
  });
});
