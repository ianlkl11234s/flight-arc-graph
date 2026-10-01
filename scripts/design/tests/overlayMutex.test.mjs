// node --import tsx --test scripts/design/tests/overlayMutex.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OVERLAY_KEYS, ALL_OVERLAYS_CLOSED, overlaysToClose, overlaysOpen } from "../../../src/ui/overlayMutex.ts";

const s = (o = {}) => ({ ...ALL_OVERLAYS_CLOSED, ...o });

describe("浮層互斥（R2）", () => {
  it("登記清單順序：rail → stats → info；dock 卡不在內", () => {
    assert.deepEqual([...OVERLAY_KEYS], ["rail", "stats", "info"]);
    assert.equal(OVERLAY_KEYS.includes("dock"), false);
  });

  it("開說明 → 關掉開著的 rail 面板", () => {
    assert.deepEqual(overlaysToClose(s({ rail: true }), s({ rail: true, info: true })), ["rail"]);
  });

  it("開統計浮層 → 關掉說明與 rail", () => {
    assert.deepEqual(
      overlaysToClose(s({ rail: true, info: true }), s({ rail: true, info: true, stats: true })),
      ["rail", "info"],
    );
  });

  it("開 rail → 關掉統計浮層", () => {
    assert.deepEqual(overlaysToClose(s({ stats: true }), s({ stats: true, rail: true })), ["stats"]);
  });

  it("只關不開 → 不動作", () => {
    assert.deepEqual(overlaysToClose(s({ rail: true, info: true }), s({ info: true })), []);
    assert.deepEqual(overlaysToClose(s({ info: true }), s()), []);
  });

  it("沒有變化 → 不動作（rail 內切換 workspace 仍是開著，不算剛打開）", () => {
    assert.deepEqual(overlaysToClose(s({ rail: true }), s({ rail: true })), []);
  });

  it("同一輪多個同時打開 → 保留清單順序第一個", () => {
    assert.deepEqual(overlaysToClose(s(), s({ info: true, stats: true })), ["info"]);
    assert.deepEqual(overlaysToClose(s(), s({ rail: true, stats: true, info: true })), ["stats", "info"]);
  });

  it("關掉後再算一輪不會互相觸發（穩定）", () => {
    const prev = s({ rail: true });
    const next = s({ rail: true, info: true });
    const closed = overlaysToClose(prev, next);
    const settled = { ...next };
    for (const k of closed) settled[k] = false;
    assert.deepEqual(overlaysToClose(next, settled), []);
  });

  it("Capture 進入：回傳全部開著的", () => {
    assert.deepEqual(overlaysOpen(s({ rail: true, info: true })), ["rail", "info"]);
    assert.deepEqual(overlaysOpen(s()), []);
  });
});
