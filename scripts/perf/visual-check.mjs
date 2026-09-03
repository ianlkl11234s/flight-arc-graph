// 視覺回歸：固定相機 + 固定時刻 + 凍結動畫 → 截圖 → 與 baseline 逐像素比對。
//
// 用法：
//   node visual-check.mjs --baseline [--scenes s1-rctp-dark,s2-apac-dark]
//   node visual-check.mjs --compare  [--scenes s1-rctp-dark,s2-apac-dark]
//
// 場景定義讀 scripts/perf/visual-scenes.json。--baseline 存 out/baseline/<id>.png，
// --compare 存 out/current/<id>.png 並逐場景呼叫 visual-diff.py 與 baseline 比對，
// 最後印總表；任一 FAIL 則 process.exit(1)。
//
// 全程單一 CDP 連線；場景之間不 reload（S1 資料只載一次，後續場景接續沿用）。
import { connectPage, evalJs, sleep } from './cdplib.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'out');
const BASELINE_DIR = path.join(OUT_DIR, 'baseline');
const CURRENT_DIR = path.join(OUT_DIR, 'current');
const DIFF_DIR = path.join(OUT_DIR, 'diff');
const SCENES_PATH = path.join(__dirname, 'visual-scenes.json');
const DIFF_SCRIPT = path.join(__dirname, 'visual-diff.py');

function parseArgs(argv) {
  const args = { mode: null, scenes: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') args.mode = 'baseline';
    else if (a === '--compare') args.mode = 'compare';
    else if (a === '--scenes') args.scenes = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--scenes=')) args.scenes = a.slice('--scenes='.length).split(',').map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.mode) {
  console.error('usage: node visual-check.mjs --baseline|--compare [--scenes id1,id2]');
  process.exit(2);
}

mkdirSync(BASELINE_DIR, { recursive: true });
mkdirSync(CURRENT_DIR, { recursive: true });
mkdirSync(DIFF_DIR, { recursive: true });

const config = JSON.parse(readFileSync(SCENES_PATH, 'utf8'));
let scenes = config.scenes;
if (args.scenes) {
  const idSet = new Set(args.scenes);
  const filtered = scenes.filter((s) => idSet.has(s.id));
  const missing = args.scenes.filter((id) => !scenes.find((s) => s.id === id));
  if (missing.length) console.warn(`[warn] 找不到場景 id：${missing.join(', ')}`);
  scenes = filtered;
}
if (!scenes.length) {
  console.error('沒有符合的場景可跑');
  process.exit(2);
}

let cdp;
let ev = () => { throw new Error('cdp not connected'); };

// 等 flights 數量與 staticBuilding／地圖／style／tiles 都穩定（抄 scenario.mjs waitStable，
// 加 map.isStyleLoaded() —— 切底圖時 areTilesLoaded 不夠）
async function waitStable(maxMs = 60000) {
  let last = -1;
  let stableFor = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await ev(`(() => { const d = window.__flightArcDebug; return [d.getFlights().length, d.scene.isStaticBuilding() || d.map.isMoving() || !d.map.areTilesLoaded() || !d.map.isStyleLoaded(), document.visibilityState]; })()`);
    if (s[0] > 0 && s[0] === last && !s[1]) {
      stableFor += 1000;
      if (stableFor >= 3000) return s;
    } else {
      stableFor = 0;
    }
    last = s[0];
    await sleep(1000);
  }
  console.warn(`[warn] waitStable 逾時（${maxMs}ms），last flights=${last}，繼續往下跑`);
  return ['timeout', last];
}

async function waitStyleReady(maxMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const ok = await ev(`!!(window.__flightArcDebug && window.__flightArcDebug.map && window.__flightArcDebug.map.isStyleLoaded())`);
    if (ok) break;
    await sleep(500);
  }
  if (Date.now() - t0 >= maxMs) console.warn(`[warn] styleReady 逾時（${maxMs}ms），繼續往下跑`);
  await sleep(500);
}

async function runSteps(steps) {
  for (const step of steps || []) {
    // 包一層 IIFE：visual-scenes.json 的每個 js step 各自獨立宣告 `const d=...`，
    // 若不包 function scope，V8 對同一 Runtime.evaluate 全域 realm 的頂層 const/let
    // 是跨呼叫持續存在的 lexical binding，第二次宣告同名變數會直接丟
    // SyntaxError: Identifier 'd' has already been declared（頁面沒 reload 就會撞到）。
    if ('js' in step) await ev(`(() => { ${step.js} })()`);
    else if ('wait' in step) await sleep(step.wait);
    else if ('stable' in step) await waitStable(step.stable);
    else if ('styleReady' in step) await waitStyleReady();
    else console.warn('[warn] 不認得的 step：', JSON.stringify(step));
  }
}

function runDiff(baselinePath, currentPath, diffPath) {
  try {
    const stdout = execFileSync('python3', [DIFF_SCRIPT, baselinePath, currentPath, diffPath], { encoding: 'utf8' });
    return JSON.parse(stdout.trim());
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString().trim() : '';
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        return { ...parsed, pass: false };
      } catch {
        // fallthrough
      }
    }
    return { error: err.message, pass: false };
  }
}

async function runScene(scene, mode, results) {
  console.log(`\n=== ${scene.id} ===  ${scene.desc || ''}`);

  // a. steps
  await runSteps(scene.steps);

  // b. jumpTo（字面值相機，不 flyTo/fitBounds）
  await ev(`window.__flightArcDebug.map.jumpTo(${JSON.stringify(scene.camera)}); 1`);

  // c. pause + seek（seek 後 timeline 的 currentTime 是 React state，不是同步寫入的 ref；
  // 若 pause() 呼叫時還在播放，可能有一個 rAF tick 還在飛，導致 seek 後讀回的 getTime()
  // 與目標差了一個 frame*speed（實測差 ~1 秒，正是這個非決定性的來源）。重試到收斂為止。
  await ev(`window.__flightArcDebug.timeline.pause(); 1`);
  await sleep(200);
  for (let i = 0; i < 6; i++) {
    await ev(`window.__flightArcDebug.timeline.seek(${scene.time}); 1`);
    await sleep(250);
    const t = await ev(`window.__flightArcDebug.getTime()`);
    if (t === scene.time) break;
    if (i === 5) console.warn(`[warn] seek 未收斂：getTime()=${t}，目標 ${scene.time}`);
  }

  // d. 再等一次 waitStable（jumpTo + seek 觸發 tile 載入與靜態軌跡重建）
  const declaredStableMs = (scene.steps || []).filter((s) => typeof s.stable === 'number').map((s) => s.stable);
  const postJumpMaxMs = declaredStableMs.length ? Math.max(...declaredStableMs) : 30000;
  await waitStable(postJumpMaxMs);

  // e. 凍結動畫（全域 freezeAt）
  await ev(`window.__flightArcDebug.freezeAnimation(${config.freezeAt}); 1`);

  // f. 滑鼠移開
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  await ev(`window.__flightArcDebug.map.getCanvas().dispatchEvent(new MouseEvent('mouseout', {bubbles:true})); 1`);

  // g. 兩段 triggerRepaint + settle
  await ev(`window.__flightArcDebug.map.triggerRepaint(); 1`);
  await sleep(config.settleMs);
  await ev(`window.__flightArcDebug.map.triggerRepaint(); 1`);
  await sleep(300);

  // h. 截圖穩定化：連拍兩張比對 bytes，完全相同才採用；不同就 triggerRepaint 再等重試。
  // 涵蓋任何「畫面其實還在微幅變化」的殘留來源（terrain DEM 逐步到位、label 位置微調等），
  // 不用逐一猜是哪個子系統造成的。
  const MAX_SHOT_RETRIES = 8;
  let buf = null;
  let shotStable = false;
  for (let i = 0; i < MAX_SHOT_RETRIES; i++) {
    if (i > 0) {
      await ev(`window.__flightArcDebug.map.triggerRepaint(); 1`);
      await sleep(400);
    }
    const shotA = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const bufA = Buffer.from(shotA.data, 'base64');
    await sleep(500);
    const shotB = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    const bufB = Buffer.from(shotB.data, 'base64');
    buf = bufB; // 逾時也要有東西可用，先保留最後一張
    if (Buffer.compare(bufA, bufB) === 0) { shotStable = true; break; }
  }
  if (!shotStable) console.warn(`  [warn] 連拍 ${MAX_SHOT_RETRIES} 次仍未收斂（畫面持續變化），採用最後一張`);

  const outDir = mode === 'baseline' ? BASELINE_DIR : CURRENT_DIR;
  const outPath = path.join(outDir, `${scene.id}.png`);
  writeFileSync(outPath, buf);
  console.log(`  saved ${path.relative(process.cwd(), outPath)} (${(buf.length / 1024).toFixed(0)} KB)`);
  results.push({ id: scene.id, savedPath: outPath, sizeKB: +(buf.length / 1024).toFixed(1) });

  if (mode === 'compare') {
    const baselinePath = path.join(BASELINE_DIR, `${scene.id}.png`);
    const diffPath = path.join(DIFF_DIR, `${scene.id}.png`);
    if (!existsSync(baselinePath)) {
      console.error(`  [FAIL] 找不到 baseline：${baselinePath}`);
      results[results.length - 1] = { id: scene.id, pass: false, error: 'no baseline' };
      return;
    }
    const r = runDiff(baselinePath, outPath, diffPath);
    results[results.length - 1] = { id: scene.id, ...r };
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`  [${status}] maxDiff=${r.maxDiff ?? 'n/a'} pctOver2=${r.pctOver2 ?? 'n/a'}% blocky=${r.blocky ?? 'n/a'}`);
  }
}

function printSummary(results) {
  console.log('\n場景                     maxDiff  >2px%    成塊    結果');
  console.log('-'.repeat(66));
  let anyFail = false;
  for (const r of results) {
    const pass = r.pass === true;
    if (!pass) anyFail = true;
    const idCol = r.id.padEnd(24);
    const maxDiffCol = String(r.maxDiff ?? (r.error ? 'ERR' : '-')).padStart(7);
    const pctCol = (r.pctOver2 != null ? `${r.pctOver2}%` : '-').padStart(8);
    const blockyCol = (r.blocky != null ? (r.blocky ? 'yes' : 'no') : '-').padStart(6);
    const statusCol = pass ? 'PASS' : `FAIL${r.error ? ` (${r.error})` : ''}`;
    console.log(`${idCol} ${maxDiffCol} ${pctCol}  ${blockyCol}  ${statusCol}`);
  }
  console.log('-'.repeat(66));
  return anyFail;
}

// canvas 尺寸校正 + 斷言（reload 之後要重跑一次）
async function ensureCanvasSize() {
  const { width, height, deviceScaleFactor } = config.viewport;
  // 實測發現：mapbox-gl 的 resize() 若偵測到 container clientWidth/Height 與上次
  // resize() 時「數值相同」就會跳過重算 canvas 實際像素（即使 devicePixelRatio 已經
  // 因 override 改變）。這個 Chrome 視窗本來就在 width x height 這個 CSS 尺寸下開啟，
  // 所以直接套目標值會被當成「沒變」而忽略，canvas 停在 override 前的舊 DPR（native 2x）。
  // 解法：先 override 成一個不同尺寸把它「彈」一下（真的觸發 resize），再切回目標值。
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: width + 1, height: height + 1, deviceScaleFactor, mobile: false });
  await ev(`window.__flightArcDebug.map.resize(); 1`);
  await sleep(150);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  await sleep(150);
  const [cw, ch, dpr] = await ev(`(() => { window.__flightArcDebug.map.resize(); const cv = window.__flightArcDebug.map.getCanvas(); return [cv.width, cv.height, devicePixelRatio]; })()`);
  const expectW = width * deviceScaleFactor;
  const expectH = height * deviceScaleFactor;
  if (cw !== expectW || ch !== expectH) {
    console.error(`[FATAL] canvas 尺寸不符：預期 ${expectW}x${expectH}，實際 ${cw}x${ch}（devicePixelRatio=${dpr}, deviceScaleFactor override=${deviceScaleFactor}）`);
    try { cdp.close(); } catch { /* ignore */ }
    process.exit(2);
  }
  console.log(`canvas 尺寸確認：${cw}x${ch}（viewport ${width}x${height} @ dsf${deviceScaleFactor}）`);
}

// 等 app 就緒（reload 之後）
async function waitAppReady(maxMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      const ok = await ev(`!!(window.__flightArcDebug && window.__flightArcDebug.map && window.__flightArcDebug.scene && window.__flightArcDebug.getFlights().length > 0)`);
      if (ok) return true;
    } catch { /* reload 途中 eval 會失敗，繼續等 */ }
    await sleep(1000);
  }
  console.warn('[warn] waitAppReady 逾時');
  return false;
}

// 起點歸零：讓 --baseline 與 --compare 兩次執行的前置狀態完全一致。
//
// 實測（2026-09-02）：底圖 style 切換會改變軌跡的渲染結果 —— 同一場景在「reload 後
// 從未切過 style」與「切過 light→dark」下截圖 maxDiff 達 90；但兩次都切過的話 maxDiff = 0。
// 場景序列裡 s1-rctp-light 會切到 light，於是「這次執行的 dark 場景前面有沒有跑過
// light 場景」就決定了結果，跨執行不可重現（--baseline 跑 dark+light、--compare 只跑
// dark 時尤其明顯）。
// 解法：每次執行開頭一律 reload（清掉前次的累積狀態與 localStorage 恢復的殘留），
// 再強制走一次 light → dark，讓所有執行都從「切換過」的同一起點出發。
async function bootstrap() {
  console.log('bootstrap：reload → style 歸零（light → dark），讓每次執行起點一致');
  await cdp.send('Page.reload', { ignoreCache: false });
  await sleep(3000);
  await waitAppReady();
  await ensureCanvasSize();
  await ev(`window.__flightArcDebug.setMapStyle('light'); 1`);
  await waitStyleReady();
  await waitStable(120000);
  await ev(`window.__flightArcDebug.setMapStyle('dark'); 1`);
  await waitStyleReady();
  await waitStable(120000);
  console.log('bootstrap 完成');
}

let hadExecError = false;
const results = [];

cdp = await connectPage();
ev = (js) => evalJs(cdp, js);

try {
  await bootstrap();

  for (const scene of scenes) {
    try {
      await runScene(scene, args.mode, results);
    } catch (err) {
      hadExecError = true;
      console.error(`  [ERROR] 場景 ${scene.id} 執行失敗：${err.message}`);
      results.push({ id: scene.id, pass: false, error: err.message });
    }
  }
} finally {
  // 全部跑完最後才解除凍結（best-effort，不因失敗而略過）
  try { await ev(`window.__flightArcDebug.freezeAnimation(null); 1`); } catch { /* ignore */ }
  cdp.close();
}

let anyFail = hadExecError;
if (args.mode === 'compare') {
  anyFail = printSummary(results) || hadExecError;
} else {
  console.log(`\nbaseline 完成，共 ${results.length} 個場景：`);
  for (const r of results) console.log(`  ${r.id.padEnd(24)} ${r.sizeKB ?? '?'} KB  ${r.savedPath ? path.relative(process.cwd(), r.savedPath) : ''}`);
}

if (anyFail) process.exit(1);
