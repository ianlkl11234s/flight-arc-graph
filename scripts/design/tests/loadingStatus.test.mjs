// node --import tsx --test scripts/design/tests/loadingStatus.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLoadingStatusController, LOADING_STATUS_TIMING as T } from "../../../src/ui/loadingStatusController.ts";

/** 假時鐘：advance(ms) 依時間順序觸發計時器 */
function harness() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  const views = [];
  const c = createLoadingStatusController({
    onChange: (v) => views.push({ ...v, at: t }),
    now: () => t,
    setTimer: (cb, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, cb });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      let next = null;
      for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
      if (!next) break;
      timers.delete(next[0]);
      t = next[1].at;
      next[1].cb();
    }
    t = end;
  };
  return { c, views, advance, last: () => views.at(-1), now: () => t };
}

describe("載入狀態條節奏（R6）", () => {
  it("時間常數：150 / 600 / 300 / 2000 / 4000", () => {
    assert.equal(T.showDelayMs, 150);
    assert.equal(T.minLoadingMs, 600);
    assert.equal(T.settleMs, 300);
    assert.equal(T.doneHoldMs, 2000);
    assert.equal(T.errorHoldMs, 4000);
  });

  it("150ms 內完成 → 完全不顯示", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "RCTP" });
    h.advance(100);
    h.c.handle({ type: "done", count: 10 });
    h.advance(10_000);
    assert.equal(h.views.length, 0);
  });

  it("超過 150ms 才顯示載入中；至少停 600ms；完成顯示「已載入 N 班」2 秒後淡出", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "RCTP · 2026-02-18" });
    h.advance(149);
    assert.equal(h.views.length, 0);
    h.advance(1);
    assert.deepEqual(
      { visible: h.last().visible, phase: h.last().phase, label: h.last().label, at: h.last().at },
      { visible: true, phase: "loading", label: "RCTP · 2026-02-18", at: 150 },
    );
    h.advance(50); // t=200，只顯示了 50ms
    h.c.handle({ type: "done", count: 1284 });
    h.advance(549);
    assert.equal(h.last().phase, "loading"); // 未滿 600ms
    h.advance(1); // t=750 = 150 + 600
    assert.equal(h.last().phase, "done");
    assert.equal(h.last().count, 1284);
    assert.equal(h.last().at, 750);
    h.advance(T.doneHoldMs - 1);
    assert.equal(h.last().visible, true);
    h.advance(1);
    assert.equal(h.last().visible, false);
    assert.equal(h.last().phase, "done"); // 淡出時內容保留
  });

  it("顯示夠久後完成 → 再等 300ms 合併", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "A" });
    h.advance(2000);
    h.c.handle({ type: "done", count: 5 });
    h.advance(299);
    assert.equal(h.last().phase, "loading");
    h.advance(1);
    assert.equal(h.last().phase, "done");
  });

  it("合併等待中又開始載入 → 繼續顯示載入中（不閃已載入）", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "A" });
    h.advance(1000);
    h.c.handle({ type: "done", count: 5 });
    h.advance(200);
    h.c.handle({ type: "start", label: "B" });
    assert.equal(h.last().phase, "loading");
    assert.equal(h.last().label, "B");
    h.advance(1000);
    assert.ok(h.views.every((v) => v.phase !== "done"));
    h.c.handle({ type: "done", count: 9 });
    h.advance(T.settleMs);
    assert.equal(h.last().phase, "done");
    assert.equal(h.last().count, 9);
  });

  it("播放中完成 → 不顯示「已載入」，直接淡出", () => {
    const h = harness();
    h.c.setPlaying(true);
    h.c.handle({ type: "start", label: "A" });
    h.advance(1000);
    h.c.handle({ type: "done", count: 5 });
    h.advance(10_000);
    assert.ok(h.views.every((v) => v.phase !== "done"));
    assert.equal(h.last().visible, false);
  });

  it("以完成那一刻為準：載完才開始播放（autoplay）仍顯示「已載入」", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "A" });
    h.advance(1000);
    h.c.handle({ type: "done", count: 5 });
    h.c.setPlaying(true); // 自動播放在同一輪啟動
    h.advance(T.settleMs);
    assert.equal(h.last().phase, "done");
    assert.equal(h.last().visible, true);
  });

  it("失敗立刻顯示、停 4 秒淡出", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "RCTP" });
    h.advance(50); // 還在 150ms 內
    h.c.handle({ type: "fail", label: "RCTP · 2026-02-18" });
    assert.equal(h.last().phase, "error");
    assert.equal(h.last().visible, true);
    h.advance(T.errorHoldMs - 1);
    assert.equal(h.last().visible, true);
    h.advance(1);
    assert.equal(h.last().visible, false);
    assert.equal(h.last().phase, "error");
  });

  it("persist 失敗一直停著，直到重試（start）或 clear", () => {
    const h = harness();
    h.c.handle({ type: "fail", label: "RCTP", persist: true });
    h.advance(60_000);
    assert.equal(h.last().phase, "error");
    assert.equal(h.last().visible, true);
    h.c.handle({ type: "start", label: "RCTP" }); // 重試：直接切回載入中
    assert.equal(h.last().phase, "loading");
    assert.equal(h.last().visible, true);
    h.c.handle({ type: "fail", label: "RCTP", persist: true });
    h.c.handle({ type: "clear" });
    assert.equal(h.last().visible, false);
  });

  it("「已載入」顯示中又開始載入 → 切回載入中，不被舊的淡出計時器收掉", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "A" });
    h.advance(1000);
    h.c.handle({ type: "done", count: 5 });
    h.advance(T.settleMs + 500);
    assert.equal(h.last().phase, "done");
    h.c.handle({ type: "start", label: "B" });
    assert.equal(h.last().phase, "loading");
    h.advance(T.doneHoldMs + T.fadeMs);
    assert.equal(h.last().phase, "loading");
    assert.equal(h.last().visible, true);
  });

  it("dispose 清掉計時器", () => {
    const h = harness();
    h.c.handle({ type: "start", label: "A" });
    h.c.dispose();
    h.advance(10_000);
    assert.equal(h.views.length, 0);
  });
});
