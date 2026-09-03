// Summary 數字快照：把 Sidebar Summary 面板實際吃到的統計 dump 成 JSON，之後每次改
// 渲染（尤其 Phase 2 換 LOD）都要證明「數字完全沒變」。
//
// 用法：
//   node summary-snapshot.mjs --baseline [--scenes s1-rctp-dark,s2-apac-dark]
//   node summary-snapshot.mjs --compare  [--scenes ...]
//
// 場景沿用 visual-scenes.json 的 steps 與 time（相機與動畫凍結與統計無關，故略過）。
// 預設只跑「資料集合不同」的三個場景：單機場 / set / world。
import { connectPage, evalJs, sleep } from './cdplib.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const BASELINE_DIR = path.join(OUT, 'baseline');
const CURRENT_DIR = path.join(OUT, 'current');
const DEFAULT_SCENES = ['s1-rctp-dark', 's2-apac-dark', 'world-globe-far'];

const argv = process.argv.slice(2);
const mode = argv.includes('--compare') ? 'compare' : argv.includes('--baseline') ? 'baseline' : null;
if (!mode) { console.error('usage: node summary-snapshot.mjs --baseline|--compare [--scenes id1,id2]'); process.exit(2); }
const scenesArgIdx = argv.findIndex((a) => a === '--scenes');
const wanted = scenesArgIdx >= 0 ? String(argv[scenesArgIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_SCENES;

mkdirSync(BASELINE_DIR, { recursive: true });
mkdirSync(CURRENT_DIR, { recursive: true });
const config = JSON.parse(readFileSync(path.join(__dirname, 'visual-scenes.json'), 'utf8'));
const scenes = config.scenes.filter((s) => wanted.includes(s.id));
if (!scenes.length) { console.error('沒有符合的場景'); process.exit(2); }

const cdp = await connectPage();
const ev = (js) => evalJs(cdp, js);

async function waitStable(maxMs = 120000) {
  let last = -1, sf = 0; const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await ev(`(() => { const d = window.__flightArcDebug; return [d.getFlights().length, d.scene.isStaticBuilding() || d.map.isMoving() || !d.map.areTilesLoaded() || !d.map.isStyleLoaded()]; })()`);
    if (s[0] > 0 && s[0] === last && !s[1]) { sf += 1000; if (sf >= 3000) return; } else sf = 0;
    last = s[0]; await sleep(1000);
  }
  console.warn(`  [warn] waitStable 逾時（${maxMs}ms）`);
}

async function runSteps(steps) {
  for (const step of steps || []) {
    if ('js' in step) await ev(`(() => { ${step.js} })()`);
    else if ('wait' in step) await sleep(step.wait);
    else if ('stable' in step) await waitStable(step.stable);
    else if ('styleReady' in step) {
      const t0 = Date.now();
      while (Date.now() - t0 < 30000) { if (await ev(`!!(window.__flightArcDebug?.map?.isStyleLoaded())`)) break; await sleep(500); }
      await sleep(500);
    }
  }
}

/** 深度比對，回傳差異路徑清單 */
function diffDeep(a, b, prefix = '') {
  const out = [];
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    const va = a?.[k], vb = b?.[k];
    if (va !== null && vb !== null && typeof va === 'object' && typeof vb === 'object') out.push(...diffDeep(va, vb, p));
    else if (JSON.stringify(va) !== JSON.stringify(vb)) out.push(`${p}: ${JSON.stringify(va)} → ${JSON.stringify(vb)}`);
  }
  return out;
}

let anyFail = false;
try {
  for (const scene of scenes) {
    console.log(`\n=== ${scene.id} ===`);
    await runSteps(scene.steps);
    await ev(`window.__flightArcDebug.timeline.pause();`);
    await sleep(200);
    for (let i = 0; i < 6; i++) {
      await ev(`window.__flightArcDebug.timeline.seek(${scene.time});`);
      await sleep(250);
      if (await ev(`window.__flightArcDebug.getTime()`) === scene.time) break;
    }
    await waitStable();
    const snap = await ev(`window.__flightArcDebug.summarySnapshot()`);
    const file = `summary-${scene.id}.json`;
    const outPath = path.join(mode === 'baseline' ? BASELINE_DIR : CURRENT_DIR, file);
    writeFileSync(outPath, JSON.stringify(snap, null, 2));
    console.log(`  saved ${path.relative(process.cwd(), outPath)}（flightCount=${snap.flightCount}）`);

    if (mode === 'compare') {
      const basePath = path.join(BASELINE_DIR, file);
      if (!existsSync(basePath)) { console.error(`  [FAIL] 找不到 baseline：${basePath}`); anyFail = true; continue; }
      const base = JSON.parse(readFileSync(basePath, 'utf8'));
      const diffs = diffDeep(base, snap);
      if (diffs.length === 0) console.log('  [PASS] 數字完全相同');
      else { anyFail = true; console.error(`  [FAIL] ${diffs.length} 處不同：`); for (const d of diffs.slice(0, 40)) console.error(`    ${d}`); }
    }
  }
} finally { cdp.close(); }

if (anyFail) process.exit(1);
