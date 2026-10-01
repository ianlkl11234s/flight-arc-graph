// node --import tsx --test scripts/design/tests/timelineExpand.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expandReducer,
  INITIAL_EXPAND_STATE,
  isExpanded,
  focusHolds,
  COLLAPSE_DELAY_MS,
} from "../../../src/ui/timelineExpand.ts";

const run = (events, from = INITIAL_EXPAND_STATE) => events.reduce(expandReducer, from);

describe("時間軸膠囊展開／收合（R4）", () => {
  it("預設收合、倒數 2 秒", () => {
    assert.equal(INITIAL_EXPAND_STATE.phase, "collapsed");
    assert.equal(isExpanded(INITIAL_EXPAND_STATE), false);
    assert.equal(COLLAPSE_DELAY_MS, 2000);
  });

  it("hover 進 → 展開；移出 → 倒數（仍展開）；timeout → 收合", () => {
    const entered = run([{ type: "pointerEnter" }]);
    assert.equal(entered.phase, "expanded");
    const left = expandReducer(entered, { type: "pointerLeave" });
    assert.equal(left.phase, "closing");
    assert.equal(isExpanded(left), true);
    assert.equal(expandReducer(left, { type: "timeout" }).phase, "collapsed");
  });

  it("倒數期間移回來 → 取消收合，舊 timeout 無效", () => {
    const back = run([{ type: "pointerEnter" }, { type: "pointerLeave" }, { type: "pointerEnter" }]);
    assert.equal(back.phase, "expanded");
    assert.equal(expandReducer(back, { type: "timeout" }).phase, "expanded");
  });

  it("鍵盤 focus 進入 → 展開；滑鼠移出但 focus 還在 → 不收", () => {
    const s = run([{ type: "focusIn" }, { type: "pointerEnter" }, { type: "pointerLeave" }]);
    assert.equal(s.phase, "expanded");
    const out = expandReducer(s, { type: "focusOut" });
    assert.equal(out.phase, "closing");
    assert.equal(expandReducer(out, { type: "timeout" }).phase, "collapsed");
  });

  it("拖曳中移出 → 不收；放開後才倒數", () => {
    const dragging = run([{ type: "pointerEnter" }, { type: "dragStart" }, { type: "pointerLeave" }]);
    assert.equal(dragging.phase, "expanded");
    assert.equal(expandReducer(dragging, { type: "timeout" }).phase, "expanded");
    assert.equal(expandReducer(dragging, { type: "dragEnd" }).phase, "closing");
  });

  it("收合時直接拖曳 → 展開", () => {
    assert.equal(run([{ type: "dragStart" }]).phase, "expanded");
  });

  it("月曆開著 → 移出也不收；關掉月曆才倒數", () => {
    const open = run([{ type: "pointerEnter" }, { type: "popup", open: true }, { type: "pointerLeave" }]);
    assert.equal(open.phase, "expanded");
    assert.equal(expandReducer(open, { type: "timeout" }).phase, "expanded");
    const closed = expandReducer(open, { type: "popup", open: false });
    assert.equal(closed.phase, "closing");
    assert.equal(expandReducer(closed, { type: "timeout" }).phase, "collapsed");
  });

  it("多個 hold 同時成立：要全部解除才倒數", () => {
    let s = run([{ type: "pointerEnter" }, { type: "focusIn" }, { type: "dragStart" }, { type: "popup", open: true }]);
    for (const ev of [{ type: "pointerLeave" }, { type: "focusOut" }, { type: "dragEnd" }]) {
      s = expandReducer(s, ev);
      assert.equal(s.phase, "expanded");
    }
    s = expandReducer(s, { type: "popup", open: false });
    assert.equal(s.phase, "closing");
  });

  it("點膠囊（觸控）→ 展開後倒數收合", () => {
    const tapped = run([{ type: "activate" }]);
    assert.equal(isExpanded(tapped), true);
    assert.equal(tapped.phase, "closing");
    assert.equal(expandReducer(tapped, { type: "timeout" }).phase, "collapsed");
  });

  it("收合狀態下的 timeout 不改狀態（同一物件）", () => {
    assert.equal(expandReducer(INITIAL_EXPAND_STATE, { type: "timeout" }), INITIAL_EXPAND_STATE);
  });
});

describe("focus 是否算 hold（滑鼠點出來的 focus 不算）", () => {
  it("鍵盤 Tab 進來的按鈕／滑桿 → 算", () => assert.equal(focusHolds("other", false), true));
  it("滑鼠點按鈕／拖滑桿留下的 focus → 不算", () => assert.equal(focusHolds("other", true), false));
  it("原生 select（下拉開著）→ 不論輸入方式都算", () => {
    assert.equal(focusHolds("select", true), true);
    assert.equal(focusHolds("select", false), true);
  });
});
