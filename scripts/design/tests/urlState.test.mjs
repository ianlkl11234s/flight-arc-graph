// node --import tsx --test scripts/design/tests/urlState.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeUrlState, encodeUrlState, buildSearch, isValidDate } from "../../../src/data/urlState.ts";

const roundTrip = (state, opts) => decodeUrlState(buildSearch(encodeUrlState(state, opts)));

describe("網址記住狀態（R8／P6）", () => {
  it("往返一致：單機場 + 日期 + 起降 + 染色 + 配色 + 時刻 + 鏡頭 + 航班", () => {
    const state = {
      airport: "RJAA",
      date: "2026-02-19",
      depArr: "arr",
      colorBy: "deparr",
      theme: "sunset",
      time: { minutes: 11 * 60 + 41, dayOffset: 0 },
      camera: { lat: 35.7647, lng: 140.3864, zoom: 10.25, pitch: 55, bearing: -12.5 },
      flight: "3e1a2b4c",
    };
    assert.deepEqual(roundTrip(state), state);
  });

  it("往返一致：組合（預設 id／自訂清單）、區域、多日、Compare、空域快照、跨日時刻", () => {
    assert.deepEqual(roundTrip({ setId: "apac-hub" }), { setId: "apac-hub" });
    assert.deepEqual(roundTrip({ setIcaos: ["RCTP", "RJAA", "VHHH"] }), { setIcaos: ["RCTP", "RJAA", "VHHH"] });
    assert.deepEqual(roundTrip({ scope: "JP", dataSource: "airspace" }), { scope: "JP", dataSource: "airspace" });
    assert.deepEqual(roundTrip({ date: "2026-07-09", days: 3, time: { minutes: 5, dayOffset: 2 } }),
      { date: "2026-07-09", days: 3, time: { minutes: 5, dayOffset: 2 } });
    assert.deepEqual(roundTrip({ compare: ["2026-02-18", "2026-07-11"] }), { compare: ["2026-02-18", "2026-07-11"] });
  });

  it("網址可讀：逗號與冒號不跳脫、v 在最前", () => {
    const s = buildSearch(encodeUrlState({ setIcaos: ["RCTP", "RJAA"], time: { minutes: 701, dayOffset: 0 } }));
    assert.equal(s, "?v=1&set=RCTP,RJAA&t=11:41");
  });

  it("預設值不寫：全部預設 → 空字串（不帶 ?、不寫 v）", () => {
    const q = encodeUrlState({
      airport: "RCTP", date: "2026-02-18", days: 1, depArr: "all", colorBy: "altitude",
      theme: "default", dataSource: "tracks",
    });
    assert.equal(buildSearch(q), "");
    assert.equal(buildSearch(encodeUrlState({})), "");
  });

  it("鏡頭等於預設鏡頭（輸出精度內）不寫；不同才寫", () => {
    const def = { lat: 25.0927, lng: 121.2281, zoom: 10.4, pitch: 57, bearing: 16 };
    assert.equal(buildSearch(encodeUrlState({ camera: { ...def, lat: 25.09271 } }, { defaultCamera: def })), "");
    assert.match(buildSearch(encodeUrlState({ camera: { ...def, zoom: 11 } }, { defaultCamera: def })), /cam=25\.0927,121\.2281,11,57,16/);
  });

  it("未知 key 靜默忽略", () => {
    assert.deepEqual(decodeUrlState("?v=1&foo=1&a=RJAA&bar=x"), { airport: "RJAA" });
  });

  it("版本缺少或不符仍盡量解析（與 Pulse 不同）", () => {
    assert.deepEqual(decodeUrlState("a=RJAA&f=dep"), { airport: "RJAA", depArr: "dep" });
    assert.deepEqual(decodeUrlState("?v=9&a=RJAA"), { airport: "RJAA" });
  });

  it("壞值只丟該 key、不 throw", () => {
    assert.deepEqual(decodeUrlState("?a=XXXX&d=2026-99-99&foo=1"), { airport: "XXXX" }); // XXXX 格式合法，存在與否由 App 查目錄
    assert.deepEqual(decodeUrlState("?a=R!&d=2026-02-30&n=0&cmp=x,y&f=up&cb=red&th=nope&t=25:00&cam=abc&ds=x&fl=%3Cscript%3E&scope=1"), {});
    assert.deepEqual(decodeUrlState("?n=2.5"), {});
    assert.deepEqual(decodeUrlState("?n=999"), {});
    assert.deepEqual(decodeUrlState("?cam=91,0,5"), {});
    assert.deepEqual(decodeUrlState("?cam=25,121"), {});
    assert.deepEqual(decodeUrlState("?th=__proto__"), {});
    assert.deepEqual(decodeUrlState("?t=11:60"), {});
    assert.deepEqual(decodeUrlState("%%%"), {});
    assert.equal(isValidDate("2024-02-29"), true);
    assert.equal(isValidDate("2026-02-29"), false);
  });

  it("鏡頭部分欄位壞掉：pitch 越界歸 0、bearing 正規化", () => {
    assert.deepEqual(decodeUrlState("?cam=25,121,10,99,370"), { camera: { lat: 25, lng: 121, zoom: 10, pitch: 0, bearing: 10 } });
  });

  it("時刻：+N 與手打的空白（+ 被解成空白）都收", () => {
    assert.deepEqual(decodeUrlState("?t=11:41%2B1").time, { minutes: 701, dayOffset: 1 });
    assert.deepEqual(decodeUrlState("?t=11:41+1").time, { minutes: 701, dayOffset: 1 });
  });

  it("組合清單：小寫轉大寫、去重、壞 ICAO 逐一丟、全壞則整個丟", () => {
    assert.deepEqual(decodeUrlState("?set=rctp,RJAA,rctp,!!"), { setIcaos: ["RCTP", "RJAA"] });
    assert.deepEqual(decodeUrlState("?set=!!,??"), {});
  });

  it("互斥 a／set／scope：decode 時 set > scope > a", () => {
    assert.deepEqual(decodeUrlState("?a=RJAA&set=apac-hub"), { setId: "apac-hub" });
    assert.deepEqual(decodeUrlState("?a=RJAA&scope=JP"), { scope: "JP" });
    // set 壞掉 → 視同沒有 set，a 仍有效
    assert.deepEqual(decodeUrlState("?a=RJAA&set=!!"), { airport: "RJAA" });
  });

  it("互斥 a／set／scope：encode 時也只寫優先者", () => {
    assert.equal(buildSearch(encodeUrlState({ airport: "RJAA", setId: "apac-hub", scope: "JP" })), "?v=1&set=apac-hub");
    assert.equal(buildSearch(encodeUrlState({ airport: "RJAA", scope: "JP" })), "?v=1&scope=JP");
    assert.equal(buildSearch(encodeUrlState({ setId: "no-such-set", airport: "RJAA" })), "?v=1&a=RJAA");
  });
});
