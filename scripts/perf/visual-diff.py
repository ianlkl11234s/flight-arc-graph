#!/usr/bin/env python3
"""逐像素視覺回歸比對。

用法: python3 visual-diff.py <baseline.png> <current.png> <out-diff.png>

印一行 JSON 到 stdout：
  {"maxDiff": 7, "pctOver2": 0.31, "blocky": false, "blockyWorst": 0.12, "size": [1600,913], "pass": true}

判定：
- maxDiff：逐像素 RGB 三通道絕對差取最大值後，再取全圖最大值
- pctOver2：diff > 2/255 的像素佔比（百分比，0-100）
- 成塊（blocky）：把 diff>2 的 boolean mask 切成 16x16 像素的 block（邊緣不足補 0），
  每個 block 取 mean；任一 block mean > 0.5 視為成塊
- pass = pctOver2 < 0.5 且 blocky == False

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
    pct_over2 = float(over2.sum()) / float(diff.size) * 100.0 if diff.size else 0.0

    # 成塊判定：16x16 像素 block，邊緣不足補 0
    pad_h = (-h) % 16
    pad_w = (-w) % 16
    mask = over2.astype(np.float32)
    if pad_h or pad_w:
        mask = np.pad(mask, ((0, pad_h), (0, pad_w)), mode="constant", constant_values=0)
    ph, pw = mask.shape
    blocks = mask.reshape(ph // 16, 16, pw // 16, 16).mean(axis=(1, 3))
    blocky_worst = float(blocks.max()) if blocks.size else 0.0
    blocky = bool(blocky_worst > 0.5)

    passed = bool(pct_over2 < 0.5 and not blocky)

    # 輸出 diff 圖：每像素差值 ×20 clip 到 255，灰階存 PNG
    diff_img = np.clip(diff.astype(np.int32) * 20, 0, 255).astype(np.uint8)
    Image.fromarray(diff_img, mode="L").save(out_path)

    print(json.dumps({
        "maxDiff": max_diff,
        "pctOver2": round(pct_over2, 4),
        "blocky": blocky,
        "blockyWorst": round(blocky_worst, 4),
        "size": [w, h],
        "pass": passed,
    }))
    return 0  # 通過與否由呼叫端（visual-check.mjs）依 pass 欄位判定，exit code 恆 0（size mismatch 除外）


if __name__ == "__main__":
    sys.exit(main())
