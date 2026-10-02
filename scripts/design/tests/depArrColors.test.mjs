// node --import tsx --test scripts/design/tests/depArrColors.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyDepArr,
  computeDepArrColoring,
  cumulativeFractions,
  fractionAtTime,
  mixHex,
} from "../../../src/data/depArrColors.ts";
import { TRAJ } from "../../../src/types/colorTheme.ts";
import { TrackPath } from "../../../src/types/trackPath.ts";

const one = new Set(["RCTP"]);
const taipei = new Set(["RCTP", "RCSS"]);

describe("起降分類", () => {
  it("單機場：dest 在選定 → 進場；origin 在選定 → 離場", () => {
    assert.equal(classifyDepArr("RJTT", "RCTP", one), "arr");
    assert.equal(classifyDepArr("RCTP", "RJTT", one), "dep");
  });

  it("組合內互飛 → internal；兩端都不在 → null", () => {
    assert.equal(classifyDepArr("RCSS", "RCTP", taipei), "internal");
    assert.equal(classifyDepArr("RCTP", "RCSS", taipei), "internal");
    assert.equal(classifyDepArr("RJTT", "VHHH", taipei), null);
  });

  it("缺 ICAO（空字串／null）不算在選定內", () => {
    assert.equal(classifyDepArr("", "RCTP", one), "arr");
    assert.equal(classifyDepArr(null, undefined, one), null);
  });
});

describe("起降色指派", () => {
  const flights = [
    { fr24_id: "a", origin_icao: "RJTT", dest_icao: "RCTP" },
    { fr24_id: "d", origin_icao: "RCSS", dest_icao: "RJTT" },
    { fr24_id: "i", origin_icao: "RCSS", dest_icao: "RCTP" },
    { fr24_id: "x", origin_icao: "RJTT", dest_icao: "VHHH" },
  ];

  it("暗色：進場藍、離場橘、互飛為 [離場, 進場] 漸層", () => {
    const c = computeDepArrColoring(flights, taipei, true);
    assert.equal(c.flat.get("a"), TRAJ.dark.arr);
    assert.equal(c.flat.get("d"), TRAJ.dark.dep);
    assert.deepEqual(c.gradients.get("i"), [TRAJ.dark.dep, TRAJ.dark.arr]);
    assert.equal(c.flat.has("i"), false);
    assert.equal(c.flat.has("x"), false);
    assert.equal(c.gradients.has("x"), false);
  });

  it("淡色底圖用淡色組", () => {
    const c = computeDepArrColoring(flights, taipei, false);
    assert.equal(c.flat.get("a"), TRAJ.light.arr);
    assert.equal(c.flat.get("d"), TRAJ.light.dep);
  });
});

describe("沿路漸層比例", () => {
  // 等距三點（同緯度、經度各差 1°）→ 0, .5, 1；第四點原地不動
  const path = TrackPath.fromArray([
    [0, 120, 0, 1000],
    [0, 121, 5000, 1100],
    [0, 122, 9000, 1300],
  ]);

  it("累積距離比例：起點 0、終點 1、中點依距離", () => {
    const f = cumulativeFractions(path);
    assert.equal(f.length, 3);
    assert.equal(f[0], 0);
    assert.ok(Math.abs(f[1] - 0.5) < 1e-6);
    assert.equal(f[2], 1);
  });

  it("跨換日線（經度展開或 wrap）距離仍正確", () => {
    const a = cumulativeFractions(TrackPath.fromArray([[0, 179, 0, 0], [0, 180, 0, 1], [0, 181, 0, 2]]));
    const b = cumulativeFractions(TrackPath.fromArray([[0, 179, 0, 0], [0, 180, 0, 1], [0, -179, 0, 2]]));
    assert.ok(Math.abs(a[1] - 0.5) < 1e-6);
    assert.ok(Math.abs(b[1] - 0.5) < 1e-6);
  });

  it("全長為 0 → 退回點序比例；單點 → [0]", () => {
    const f = cumulativeFractions(TrackPath.fromArray([[1, 1, 0, 0], [1, 1, 0, 1], [1, 1, 0, 2]]));
    assert.deepEqual([...f], [0, 0.5, 1]);
    assert.deepEqual([...cumulativeFractions(TrackPath.fromArray([[1, 1, 0, 0]]))], [0]);
  });

  it("時刻 → 比例：點上、段內插值、範圍外 clamp", () => {
    const f = cumulativeFractions(path);
    assert.equal(fractionAtTime(path, f, 1000), 0);
    assert.ok(Math.abs(fractionAtTime(path, f, 1100) - 0.5) < 1e-6);
    assert.ok(Math.abs(fractionAtTime(path, f, 1200) - 0.75) < 1e-6);
    assert.equal(fractionAtTime(path, f, 999), 0);
    assert.equal(fractionAtTime(path, f, 5000), 1);
  });
});

describe("mixHex", () => {
  it("端點與中點", () => {
    assert.equal(mixHex("#000000", "#ffffff", 0), "#000000");
    assert.equal(mixHex("#000000", "#ffffff", 1), "#ffffff");
    assert.equal(mixHex("#000000", "#ff8000", 0.5), "#804000");
  });
});
