// node --import tsx --test scripts/design/tests/bootSequence.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOOT_TIMING as T,
  bootAttrFor,
  bootMaskVisible,
  initBoot,
  stepBoot,
} from "../../../src/components/boot/bootSequence.ts";

const CFG = { minShowMs: 2000, enterScale: 1, reducedMotion: false };
const READY = { mapReady: true, dataSettled: true };
const WAITING = { mapReady: false, dataSettled: false };

/** 模擬 React hook：每次照 wakeInMs 醒來（或在訊號變化時）推進；回傳每個 phase 的進入時刻 */
function run({ cfg = CFG, signalsAt = () => READY, until = 40000 } = {}) {
  let s = initBoot(0);
  const seen = { loading: 0 };
  let now = 0;
  for (let i = 0; i < 500 && now <= until; i++) {
    const step = stepBoot(s, signalsAt(now), now, cfg);
    if (step.state !== s) {
      s = step.state;
      if (!(s.phase in seen)) seen[s.phase] = s.phaseAt;
      continue;
    }
    if (step.wakeInMs === null) break;
    // 訊號在 100ms 粒度變化：最多睡 100ms，模擬 effect 依訊號重跑
    now += Math.max(1, Math.min(step.wakeInMs, 100));
  }
  return { seen, final: s };
}

describe("bootSequence 開場時序", () => {
  it("資料很快就緒：仍至少顯示 minShowMs，之後 done → leaving → entering → gone", () => {
    const { seen, final } = run();
    assert.equal(seen.done, 2000);
    assert.equal(seen.leaving, 2000 + T.doneHoldMs);
    assert.equal(seen.entering, 2000 + T.doneHoldMs + T.fadeMs);
    assert.equal(seen.gone, 2000 + T.doneHoldMs + T.fadeMs + T.enterMs);
    assert.equal(final.phase, "gone");
    assert.equal(final.timedOut, false);
  });

  it("最少顯示時間可調（bootLayout.minShowMs）", () => {
    const { seen } = run({ cfg: { ...CFG, minShowMs: 500 } });
    assert.equal(seen.done, 500);
  });

  it("等地圖與資料都就緒：只有地圖 ready 不會結束", () => {
    const { seen } = run({ signalsAt: (t) => ({ mapReady: true, dataSettled: t >= 5000 }) });
    assert.equal(seen.done, 5000);
    const onlyData = run({ signalsAt: (t) => ({ mapReady: t >= 7300, dataSettled: true }) });
    assert.equal(onlyData.seen.done, 7300);
  });

  it("30 秒還沒就緒：直接淡出（不停「完成」），標記 timedOut", () => {
    const { seen, final } = run({ signalsAt: () => WAITING });
    assert.equal(seen.done, undefined);
    assert.equal(seen.leaving, T.timeoutMs);
    assert.equal(seen.gone, T.timeoutMs + T.fadeMs + T.enterMs);
    assert.equal(final.timedOut, true);
  });

  it("載入失敗也照常結束（dataSettled 涵蓋失敗）", () => {
    // App：第一次 loading=false 或 loadError≠null 即 settled
    const { seen, final } = run({ signalsAt: (t) => ({ mapReady: true, dataSettled: t >= 3000 }) });
    assert.equal(seen.done, 3000);
    assert.equal(final.phase, "gone");
  });

  it("減少動態：就緒即 gone，不等最少顯示、不淡出、不彈入", () => {
    const cfg = { ...CFG, reducedMotion: true };
    const fast = run({ cfg, signalsAt: (t) => ({ mapReady: true, dataSettled: t >= 300 }) });
    assert.equal(fast.seen.gone, 300);
    assert.equal(fast.seen.done, undefined);
    assert.equal(fast.seen.leaving, undefined);
    assert.equal(fast.seen.entering, undefined);
    const stuck = run({ cfg, signalsAt: () => WAITING });
    assert.equal(stuck.seen.gone, T.timeoutMs);
    assert.equal(stuck.final.timedOut, true);
  });

  it("進場倍率縮放 entering 長度", () => {
    const { seen } = run({ cfg: { ...CFG, enterScale: 2 } });
    assert.equal(seen.gone - seen.entering, T.enterMs * 2);
  });

  it("晚到的一次呼叫可一次跨多個 phase（例：分頁在背景、計時器被節流）", () => {
    const step = stepBoot(initBoot(0), WAITING, 40000, CFG);
    assert.equal(step.state.phase, "gone");
    assert.equal(step.state.timedOut, true);
    assert.equal(step.wakeInMs, null);
    // 就緒得晚：「完成」從觀察到就緒的那一刻起算停留
    const late = stepBoot(initBoot(0), READY, 10000, CFG);
    assert.equal(late.state.phase, "done");
    assert.equal(late.wakeInMs, T.doneHoldMs);
  });

  it("state 沒變時回傳同一物件（hook 靠它判斷不要重設 state）", () => {
    const s = initBoot(0);
    const step = stepBoot(s, WAITING, 100, CFG);
    assert.equal(step.state, s);
    assert.equal(step.wakeInMs, T.timeoutMs - 100);
  });

  it("data-boot 屬性與遮罩可見：遮罩期間 wait、淡出後 enter、結束移除", () => {
    assert.equal(bootAttrFor("loading"), "wait");
    assert.equal(bootAttrFor("done"), "wait");
    assert.equal(bootAttrFor("leaving"), "wait");
    assert.equal(bootAttrFor("entering"), "enter");
    assert.equal(bootAttrFor("gone"), null);
    assert.deepEqual(
      ["loading", "done", "leaving", "entering", "gone"].map(bootMaskVisible),
      [true, true, true, false, false],
    );
  });
});
