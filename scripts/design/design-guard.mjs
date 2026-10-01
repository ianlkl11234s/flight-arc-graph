#!/usr/bin/env node
// Design guard ratchet：寫死色碼（hex / rgb(a)）數量只准降、不准升。
//   node scripts/design/design-guard.mjs           # 與 baseline 比對，任一檔增加 → exit 1
//   node scripts/design/design-guard.mjs --update  # 數字全部不升時寫回；有任何上升 → 拒絕
// 掃描：src/components/**/*.{ts,tsx} 與 src/App.tsx；排除 colorTheme.ts、src/three/**、src/map/**
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, relative, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = resolve(root, "scripts/design/guard-baseline.json");
const update = process.argv.includes("--update");

const EXCLUDE = [
  "src/types/colorTheme.ts",
  "src/three/",
  "src/map/",
];

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

const files = [resolve(root, "src/App.tsx"), ...walk(resolve(root, "src/components"))]
  .map((p) => relative(root, p).split(sep).join("/"))
  .filter((f) => !EXCLUDE.some((x) => f === x || f.startsWith(x)))
  .sort();

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /rgba?\(/g;

const current = {};
for (const f of files) {
  const src = readFileSync(resolve(root, f), "utf8");
  current[f] = { hex: (src.match(HEX) ?? []).length, rgba: (src.match(RGB) ?? []).length };
}

const total = (o) => Object.values(o).reduce((a, v) => ({ hex: a.hex + v.hex, rgba: a.rgba + v.rgba }), { hex: 0, rgba: 0 });

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")).files : null;

if (!baseline) {
  if (!update) { console.error("guard-baseline.json 不存在；用 --update 產生初始 baseline"); process.exit(1); }
  writeFileSync(baselinePath, JSON.stringify({ files: current }, null, 2) + "\n");
  const t = total(current);
  console.log(`已建立初始 baseline：hex ${t.hex}、rgba ${t.rgba}（${files.length} 檔）`);
  process.exit(0);
}

const rises = [];
for (const f of files) {
  const b = baseline[f] ?? { hex: 0, rgba: 0 };
  const c = current[f];
  if (c.hex > b.hex) rises.push(`${f}: hex ${b.hex} -> ${c.hex}`);
  if (c.rgba > b.rgba) rises.push(`${f}: rgba ${b.rgba} -> ${c.rgba}`);
}

if (rises.length) {
  console.error("design-guard: 寫死色碼增加（請改用 tokens）：");
  for (const r of rises) console.error("  " + r);
  if (update) console.error("--update 拒絕：數字上升時不寫回 baseline");
  process.exit(1);
}

const t = total(current), bt = total(baseline);
if (update) {
  writeFileSync(baselinePath, JSON.stringify({ files: current }, null, 2) + "\n");
  console.log(`baseline 已更新：hex ${bt.hex} -> ${t.hex}、rgba ${bt.rgba} -> ${t.rgba}`);
} else {
  const lowered = t.hex < bt.hex || t.rgba < bt.rgba;
  console.log(`design-guard: OK（hex ${t.hex}、rgba ${t.rgba}）${lowered ? "；數字已低於 baseline，可用 --update 收緊" : ""}`);
}
