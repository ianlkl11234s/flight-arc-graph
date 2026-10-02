// node --import tsx --test scripts/design/tests/escStack.test.mjs（npm run design:test）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escLayerToClose, isEditableTarget } from "../../../src/ui/escStack.ts";

const base = {
  defaultPrevented: false,
  editableTarget: false,
  captureMode: false,
  exporting: false,
  infoOpen: false,
  dockCardOpen: false,
  singleFlight: false,
  panelOpen: false,
};
const s = (o = {}) => ({ ...base, ...o });

describe("Esc 分層（R7）", () => {
  it("什麼都沒開 → 無", () => {
    assert.equal(escLayerToClose(s()), null);
  });

  it("全部開著時依序：說明 → dock 卡 → 單航班 → 面板", () => {
    let st = s({ infoOpen: true, dockCardOpen: true, singleFlight: true, panelOpen: true });
    const order = [];
    for (;;) {
      const layer = escLayerToClose(st);
      if (!layer) break;
      order.push(layer);
      st = {
        ...st,
        infoOpen: layer === "info" ? false : st.infoOpen,
        dockCardOpen: layer === "dock" ? false : st.dockCardOpen,
        singleFlight: layer === "single" ? false : st.singleFlight,
        panelOpen: layer === "panel" ? false : st.panelOpen,
      };
    }
    assert.deepEqual(order, ["info", "dock", "single", "panel"]);
  });

  it("每次只處理最上面一層", () => {
    assert.equal(escLayerToClose(s({ dockCardOpen: true, panelOpen: true })), "dock");
    assert.equal(escLayerToClose(s({ singleFlight: true, panelOpen: true })), "single");
    assert.equal(escLayerToClose(s({ panelOpen: true })), "panel");
  });

  it("已被上層攔下（Modal／月曆 preventDefault）→ 不動作", () => {
    assert.equal(escLayerToClose(s({ defaultPrevented: true, dockCardOpen: true })), null);
  });

  it("焦點在輸入元件 → 讓元件自己吃", () => {
    assert.equal(escLayerToClose(s({ editableTarget: true, panelOpen: true })), null);
  });

  it("Capture 優先：直接退出 Capture，不管其他層", () => {
    assert.equal(escLayerToClose(s({ captureMode: true, dockCardOpen: true, singleFlight: true })), "capture");
    assert.equal(escLayerToClose(s({ captureMode: true, editableTarget: true })), "capture");
  });

  it("Capture 錄影／HQ 匯出中 → 不退出，也不關其他層", () => {
    assert.equal(escLayerToClose(s({ captureMode: true, exporting: true, dockCardOpen: true })), null);
  });

  it("isEditableTarget", () => {
    assert.equal(isEditableTarget({ tagName: "INPUT" }), true);
    assert.equal(isEditableTarget({ tagName: "INPUT", type: "search" }), true);
    assert.equal(isEditableTarget({ tagName: "INPUT", type: "range" }), false);
    assert.equal(isEditableTarget({ tagName: "INPUT", type: "checkbox" }), false);
    assert.equal(isEditableTarget({ tagName: "textarea" }), true);
    assert.equal(isEditableTarget({ tagName: "SELECT" }), true);
    assert.equal(isEditableTarget({ tagName: "DIV", isContentEditable: true }), true);
    assert.equal(isEditableTarget({ tagName: "BUTTON" }), false);
    assert.equal(isEditableTarget(null), false);
    assert.equal(isEditableTarget({}), false);
  });
});
