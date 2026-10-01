#!/usr/bin/env node
// 比對 src/styles/tokens.ts 與 tokens.css 的同值性；不同 → exit 1。
// 不依賴 TS 編譯器：用 regex 讀 tokens.ts 的字面值。
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = readFileSync(resolve(root, "src/styles/tokens.ts"), "utf8");
const css = readFileSync(resolve(root, "src/styles/tokens.css"), "utf8");

// TS 字面值外層引號只剝一層（字型字串內層的 " 要保留）
const unq = (v) => (/^(['"]).*\1$/s.test(v) ? v.slice(1, -1) : v);
const norm = (v) => v.replace(/\s+/g, "").toLowerCase();

/** 取 `export const NAME ... = { ... }` 的大括號內文（含巢狀） */
function block(src, startRe) {
  const m = startRe.exec(src);
  if (!m) throw new Error(`tokens.ts: 找不到 ${startRe}`);
  let i = src.indexOf("{", m.index + m[0].length - 1);
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start + 1, i);
  }
  throw new Error("tokens.ts: 大括號不平衡");
}

/** `key: value,` → { key: value }（value 為 "..."、'...'、數字） */
function pairs(body) {
  const out = {};
  const re = /(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?[\d.]+)\s*[,}\n]/g;
  let m;
  while ((m = re.exec(body + "\n"))) out[m[1]] = m[2];
  return out;
}

const cssVars = (scopeRe) => {
  const m = scopeRe.exec(css);
  if (!m) throw new Error(`tokens.css: 找不到 ${scopeRe}`);
  const body = css.slice(m.index + m[0].length, css.indexOf("}", m.index));
  const out = {};
  for (const [, k, v] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[k] = v.trim();
  return out;
};

const root_ = cssVars(/:root\s*\{/);
const dark = cssVars(/\[data-theme="dark"\]\s*\{/);
const light = cssVars(/\[data-theme="light"\]\s*\{/);

const kebab = (s) => s.replace(/([A-Z])/g, "-$1").toLowerCase();
const px = (n) => `${n}px`;
let errors = 0;
const check = (label, tsVal, cssVal) => {
  if (cssVal === undefined || norm(unq(String(tsVal))) !== norm(String(cssVal))) {
    console.error(`MISMATCH ${label}: ts=${tsVal} css=${cssVal}`);
    errors++;
  }
};

// colors
const colorBlock = block(ts, /export const COLOR[^=]*=\s*\{/);
for (const [theme, cssSet] of [["dark", dark], ["light", light]]) {
  const m = new RegExp(`${theme}\\s*:\\s*\\{`).exec(colorBlock);
  const b = block(colorBlock.slice(m.index), new RegExp(`${theme}\\s*:\\s*\\{`));
  const p = pairs(b);
  if (Object.keys(p).length !== 13) { console.error(`${theme}: 預期 13 個色票，實得 ${Object.keys(p).length}`); errors++; }
  for (const [k, v] of Object.entries(p)) check(`COLOR.${theme}.${k}`, v, cssSet[kebab(k)]);
}

// blur
check("BLUR", px(/export const BLUR\s*=\s*(\d+)/.exec(ts)[1]), root_["blur"]);

// font
for (const [k, v] of Object.entries(pairs(block(ts, /export const FONT\s*=\s*\{/)))) check(`FONT.${k}`, v, root_[`font-${k}`]);

// size / space (keys sNN → --size-NN / --space-NN)
for (const [k, v] of Object.entries(pairs(block(ts, /export const SIZE\s*=\s*\{/)))) check(`SIZE.${k}`, px(v), root_[`size-${k.slice(1)}`]);
for (const [k, v] of Object.entries(pairs(block(ts, /export const SPACE\s*=\s*\{/)))) check(`SPACE.${k}`, px(v), root_[`space-${k.slice(1)}`]);

// radius
const rad = pairs(block(ts, /export const RADIUS\s*=\s*\{/));
check("RADIUS.base", px(rad.base), root_["radius"]);
check("RADIUS.pill", px(rad.pill), root_["radius-pill"]);

// z
for (const [k, v] of Object.entries(pairs(block(ts, /export const Z\s*=\s*\{/)))) check(`Z.${k}`, v, root_[`z-${kebab(k)}`]);

// layout
for (const [k, v] of Object.entries(pairs(block(ts, /export const LAYOUT\s*=\s*\{/)))) check(`LAYOUT.${k}`, px(v), root_[kebab(k)]);

if (errors) { console.error(`check-tokens-sync: ${errors} 處不同步`); process.exit(1); }
console.log("check-tokens-sync: OK");
