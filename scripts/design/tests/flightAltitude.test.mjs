// node --import tsx --test scripts/design/tests/flightAltitude.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { altitudeAt } from "../../../src/data/flightAltitude.ts";
import { TrackPath } from "../../../src/types/trackPath.ts";

// TrailPoint = [lat, lng, alt(m), t]
const path = TrackPath.fromArray([
  [25.0, 121.2, 0, 1000],
  [25.1, 121.3, 1500.4, 1100],
  [25.2, 121.4, 9000.6, 1200],
]);

describe("航班卡目前高度", () => {
  it("取該時刻以前最後一點的高度（四捨五入）", () => {
    assert.equal(altitudeAt(path, 1000), 0);
    assert.equal(altitudeAt(path, 1150), 1500);
    assert.equal(altitudeAt(path, 1200), 9001);
  });

  it("航跡時間範圍外（未起飛／已落地）→ null", () => {
    assert.equal(altitudeAt(path, 999), null);
    assert.equal(altitudeAt(path, 1201), null);
  });

  it("空航跡 → null", () => {
    assert.equal(altitudeAt(TrackPath.fromArray([]), 1000), null);
  });
});
