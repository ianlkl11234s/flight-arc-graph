// Phase 0 量測共用函式
import { CDP, findPageTarget, evalJs, sleep } from '../../../../scripts/perf/cdplib.mjs';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export { sleep };
// 輸出目錄預設為本目錄；PHASE0_OUT 可覆寫（Phase 0 原始資料已進版控，複測請指到 scripts/perf/out/ 之類 gitignored 位置）
export const S = process.env.PHASE0_OUT ? path.resolve(process.env.PHASE0_OUT) : HERE;
export const PROFILE = path.resolve(HERE, '../../../../scripts/perf/out/phase0-profile');
fs.mkdirSync(S + '/out', { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const URL0 = 'http://localhost:5199/';

export function log(file, obj) {
  const line = JSON.stringify({ ts: Date.now(), ...obj });
  fs.appendFileSync(S + '/out/' + file, line + '\n');
  console.log(line.length > 900 ? line.slice(0, 900) + '…' : line);
}

export function myChromePids() {
  const out = execFileSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return out.split('\n').filter(l => l.includes(PROFILE)).map(l => +l.trim().split(/\s+/)[0]).filter(Boolean);
}

export function footprints(pids) {
  if (!pids.length) return {};
  let out = '';
  try { out = execFileSync('footprint', ['--noCategories', '-f', 'bytes', ...pids.flatMap(p => ['-p', String(p)])], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { out = e.stdout || ''; }
  const res = {}; let cur = null;
  for (const l of out.split('\n')) {
    let m = l.match(/\[(\d+)\]: .*Footprint: (\d+) B/); if (m) { cur = +m[1]; res[cur] = { fp: +m[2] / 1048576 }; continue; }
    m = l.match(/phys_footprint: (\d+) B/); if (m && cur) res[cur].phys = +m[1] / 1048576;
    m = l.match(/phys_footprint_peak: (\d+) B/); if (m && cur) res[cur].peak = +m[1] / 1048576;
  }
  return res;
}

export function sysState() {
  const pressure = +execFileSync('sysctl', ['-n', 'kern.memorystatus_vm_pressure_level'], { encoding: 'utf8' }).trim();
  const sw = execFileSync('sysctl', ['vm.swapusage'], { encoding: 'utf8' });
  const used = sw.match(/used = ([\d.]+)M/); const total = sw.match(/total = ([\d.]+)M/);
  return { pressure, swapUsedMB: used ? +used[1] : null, swapTotalMB: total ? +total[1] : null };
}

export function launchChrome() {
  const args = ['--remote-debugging-port=9333', `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--window-size=1480,940', '--window-position=100,100', '--enable-precise-memory-info',
    '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-extensions', 'about:blank'];
  const p = spawn(CHROME, args, { detached: true, stdio: 'ignore' });
  p.unref();
  fs.writeFileSync(S + '/out/chrome.pid', String(p.pid));
  return p.pid;
}

export function killMyChrome() {
  const pids = myChromePids();
  if (pids.length) try { execFileSync('kill', pids.map(String)); } catch {}
  return pids;
}

export async function browserCdp() {
  for (let i = 0; i < 40; i++) {
    try { const v = await (await fetch('http://localhost:9333/json/version')).json(); return await new CDP(v.webSocketDebuggerUrl).connect(); } catch { await sleep(500); }
  }
  throw new Error('no browser cdp');
}

export async function pageCdp(prefix = '') {
  const list = await (await fetch('http://localhost:9333/json')).json();
  const t = list.find(t => t.type === 'page' && t.url.startsWith(prefix));
  return new CDP(t.webSocketDebuggerUrl).connect();
}

/** 回傳 {browser, gpu, renderers:[{pid,cpu}]}（SystemInfo.getProcessInfo） */
export async function procInfo(bc) {
  const r = await bc.send('SystemInfo.getProcessInfo');
  const o = { renderers: [], other: [] };
  for (const p of r.processInfo) {
    if (p.type === 'browser') o.browser = { pid: p.id, cpu: p.cpuTime };
    else if (p.type === 'GPU') o.gpu = { pid: p.id, cpu: p.cpuTime };
    else if (p.type === 'renderer') o.renderers.push({ pid: p.id, cpu: p.cpuTime });
    else o.other.push({ type: p.type, pid: p.id, cpu: p.cpuTime });
  }
  return o;
}

/** 安全護欄；回傳 {ok, ...數字} */
export function guard() {
  const s = sysState();
  const mine = myChromePids();
  const fps = footprints(mine);
  const myTotal = Object.values(fps).reduce((a, x) => a + (x.phys ?? x.fp ?? 0), 0);
  const ok = s.pressure < 4 && (s.swapUsedMB ?? 0) < 8192 && myTotal < 6144;
  return { ok, ...s, myChromeTotalMB: +myTotal.toFixed(1), nMyProcs: mine.length };
}

export const ev = (c, js) => evalJs(c, js);
