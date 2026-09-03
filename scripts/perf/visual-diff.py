#!/usr/bin/env python3
"""逐像素視覺回歸比對。

用法: python3 visual-diff.py <baseline.png> <current.png> <out-diff.png>

印一行 JSON 到 stdout：
  {"maxDiff": 7, "pctOver2": 0.31, "pctOver8": 0.0, "blocky": false, "blockyWorst": 0.0,
   "blockyWorst2": 0.12, "size": [1600,913], "pass": true}

判定（顯著閾值 8/255，理由見下）：
- maxDiff：逐像素 RGB 三通道絕對差取最大值後，再取全圖最大值
- pctOver2 / pctOver8：diff 超過 2/255、8/255 的像素佔比（百分比，0-100）
- 成塊（blocky）：把 diff>8 的 mask 切成 16x16 像素 block（邊緣不足補 0），
  任一 block mean > 0.5 視為成塊；blockyWorst2 是同樣算法但用 diff>2，僅供參考
- pass = pctOver8 < 0.15 且 blocky == False

為什麼顯著閾值是 8 而不是 2（2026-09-02 實測定的）：
additive blending 下，把兩次 8-bit 累加合併成一次（T0-1）數學上等價，但每條線的
捨入會累積，軌跡密集處實測最大到 8/255 —— 在任何顯示器上都不可辨。用 2/255 當門檻時，
密集區整個 16x16 block 會被捨入差填滿而誤判「成塊」。改用 8/255 後：Tier 0 前後比對
在 s1-rctp-dark / light / timewindow 三個場景的 pctOver8 都是 0.000%，而真實差異
（s1-progressive 的 T0-5 修正）仍被抓出來（0.022%）。
0.15% 的門檻取自同版本背靠背的噪聲底線（s2-apac 0.068%、world 0.046%）的兩倍餘裕。

尺寸不同 → 印 {"error": "size mismatch", ...} 並 exit 1。
"""
import json
import sys

import numpy as np
from PIL import Image


def main() -> int:
    if len(sys.argv) != 4:
        print(json.dumps({"error": "usage: visual-diff.py <baseline.png> <current.png> <out-diff.png>"}))
        return 1

    baseline_path, current_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

    baseline_img = Image.open(baseline_path).convert("RGB")
    current_img = Image.open(current_path).convert("RGB")

    if baseline_img.size != current_img.size:
        print(json.dumps({
            "error": "size mismatch",
            "baselineSize": list(baseline_img.size),
            "currentSize": list(current_img.size),
        }))
        return 1

    a = np.asarray(baseline_img, dtype=np.int16)
    b = np.asarray(current_img, dtype=np.int16)

    # 逐像素 RGB 三通道絕對差 → 取每像素最大值
    diff = np.abs(a - b).max(axis=2)  # shape (H, W)
    h, w = diff.shape

    max_diff = int(diff.max()) if diff.size else 0
    over2 = diff > 2
    over8 = diff > 8
    pct_over2 = float(over2.sum()) / float(diff.size) * 100.0 if diff.size else 0.0
    pct_over8 = float(over8.sum()) / float(diff.size) * 100.0 if diff.size else 0.0

    # 成塊判定：16x16 像素 block，邊緣不足補 0
    def worst_block(mask_bool: np.ndarray) -> float:
        pad_h = (-h) % 16
        pad_w = (-w) % 16
        mask = mask_bool.astype(np.float32)
        if pad_h or pad_w:
            mask = np.pad(mask, ((0, pad_h), (0, pad_w)), mode="constant", constant_values=0)
        ph, pw = mask.shape
        blocks = mask.reshape(ph // 16, 16, pw // 16, 16).mean(axis=(1, 3))
        return float(blocks.max()) if blocks.size else 0.0

    blocky_worst = worst_block(over8)
    blocky_worst2 = worst_block(over2)
    blocky = bool(blocky_worst > 0.5)

    passed = bool(pct_over8 < 0.15 and not blocky)

    # 輸出 diff 圖：每像素差值 ×20 clip 到 255，灰階存 PNG
    diff_img = np.clip(diff.astype(np.int32) * 20, 0, 255).astype(np.uint8)
    Image.fromarray(diff_img, mode="L").save(out_path)

    print(json.dumps({
        "maxDiff": max_diff,
        "pctOver2": round(pct_over2, 4),
        "pctOver8": round(pct_over8, 4),
        "blocky": blocky,
        "blockyWorst": round(blocky_worst, 4),
        "blockyWorst2": round(blocky_worst2, 4),
        "size": [w, h],
        "pass": passed,
    }))
    return 0  # 通過與否由呼叫端（visual-check.mjs）依 pass 欄位判定，exit code 恆 0（size mismatch 除外）


if __name__ == "__main__":
    sys.exit(main())
