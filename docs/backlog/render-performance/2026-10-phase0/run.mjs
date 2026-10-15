// node run.mjs <mode>   modes: launch | kill | probe | baseline | ta | world | tg | idle | s1s2
import { S, log, footprints, guard, launchChrome, killMyChrome, browserCdp, pageCdp, procInfo, ev, sleep, URL0, sysState } from './lib.mjs';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
const mode = process.argv[2];
const OUT = mode + '.jsonl';

if (mode === 'launch') { killMyChrome(); await sleep(1500); launchChrome(); const bc = await browserCdp(); log('launch.jsonl', { launched: true, ...(await procInfo(bc)) }); bc.close(); process.exit(0); }
if (mode === 'kill') { console.log('killed', killMyChrome()); process.exit(0); }

const bc = await browserCdp();
let pc = await pageCdp();
const consoleHits = [];
function hookPage(c) {
  c.on('Runtime.consoleAPICalled', p => { const t = (p.args || []).map(a => a.value ?? a.description ?? '').join(' '); if (/style diff|Unable|error|Error/i.test(t)) consoleHits.push({ t: Date.now(), type: p.type, text: t.slice(0, 300) }); });
  c.on('Runtime.exceptionThrown', p => consoleHits.push({ t: Date.now(), type: 'exception', text: (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 300) }));
  c.on('Log.entryAdded', p => { if (/style diff|error/i.test(p.entry.text)) consoleHits.push({ t: Date.now(), type: 'log-' + p.entry.level, text: p.entry.text.slice(0, 300) }); });
}
async function enable(c) { await c.send('Runtime.enable'); await c.send('Log.enable'); await c.send('Performance.enable'); await c.send('Page.enable'); await c.send('HeapProfiler.enable'); }
hookPage(pc); await enable(pc);

const E = (js) => ev(pc, js);
async function gc() { await pc.send('HeapProfiler.collectGarbage'); await sleep(300); await pc.send('HeapProfiler.collectGarbage'); await sleep(1200); }

async function pids() {
  const pi = await procInfo(bc);
  const all = [pi.gpu?.pid, ...pi.renderers.map(r => r.pid)].filter(Boolean);
  const fp = footprints(all);
  // page renderer = 目前 footprint 最大的 renderer
  let rend = null; for (const r of pi.renderers) { if (!rend || (fp[r.pid]?.phys ?? 0) > (fp[rend.pid]?.phys ?? 0)) rend = r; }
  return { pi, fp, rend };
}

async function snap(label, extra = {}, doGc = true) {
  if (doGc) await gc();
  const { pi, fp, rend } = await pids();
  const m = Object.fromEntries((await pc.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
  let hu = null; try { hu = await pc.send('Runtime.getHeapUsage'); } catch {}
  let app = null;
  try {
    app = await E(`(() => { var d = window.__flightArcDebug; if (!d) return null; const mp = d.map; let sb=null; try { sb = d.scene && d.scene.isStaticBuilding(); } catch {}
      const fl = d.getFlights ? d.getFlights() : []; let pts = 0; for (const f of fl) pts += f.path.length;
      return { flights: fl.length, points: pts, lod: d.getLod && d.getLod(), zoom: mp && +mp.getZoom().toFixed(2), proj: mp && mp.getProjection && mp.getProjection().name, style: d.state.mapStyleId, scope: d.state.scope, region: d.state.region, set: d.state.airportSet, ap: d.state.selectedAirport, staticBuilding: sb, moveL: mp && mp._listeners && mp._listeners.move ? mp._listeners.move.length : null, styleLoadL: mp && mp._listeners && mp._listeners['style.load'] ? mp._listeners['style.load'].length : null, heapUsedMB: +(performance.memory.usedJSHeapSize/1048576).toFixed(1), vis: document.visibilityState }; })()`);
  } catch (e) { app = { err: String(e).slice(0, 200) }; }
  const rec = {
    label, ...extra,
    rendererPid: rend?.pid, rendererMB: +(fp[rend?.pid]?.phys ?? 0).toFixed(1), rendererPeakMB: +(fp[rend?.pid]?.peak ?? 0).toFixed(1),
    gpuPid: pi.gpu?.pid, gpuMB: +(fp[pi.gpu?.pid]?.phys ?? 0).toFixed(1), gpuPeakMB: +(fp[pi.gpu?.pid]?.peak ?? 0).toFixed(1),
    otherRenderers: pi.renderers.filter(r => r.pid !== rend?.pid).map(r => [r.pid, +(fp[r.pid]?.phys ?? 0).toFixed(1)]),
    JSHeapUsedMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), JSHeapTotalMB: +(m.JSHeapTotalSize / 1048576).toFixed(1),
    heapUsage: hu ? Object.fromEntries(Object.entries(hu).map(([k, v]) => [k, +(v / 1048576).toFixed(1)])) : null,
    JSEventListeners: m.JSEventListeners, Nodes: m.Nodes, app, guard: guard(),
  };
  log(OUT, rec);
  return rec;
}

async function waitStable(maxMs = 120000) {
  let last = -1, stableFor = 0; const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    let s; try { s = await E(`(() => { var d = window.__flightArcDebug; if (!d || !d.map) return [0, true]; let sb = true; try { sb = d.scene ? d.scene.isStaticBuilding() : true; } catch {} return [d.getFlights().length, sb || d.map.isMoving() || !d.map.areTilesLoaded() || !d.map.isStyleLoaded()]; })()`); } catch { s = [0, true]; }
    if (s[0] > 0 && s[0] === last && !s[1]) { stableFor += 1000; if (stableFor >= 3000) return { ok: true, flights: s[0], ms: Date.now() - t0 }; } else stableFor = 0;
    last = s[0]; await sleep(1000);
  }
  return { ok: false, flights: last, ms: Date.now() - t0 };
}

async function navigateFresh() {
  await pc.send('Page.navigate', { url: URL0 });
  for (let i = 0; i < 90; i++) { try { if (await E(`!!(window.__flightArcDebug && window.__flightArcDebug.map && window.__flightArcDebug.scene)`)) break; } catch {} await sleep(1000); }
  return waitStable();
}

// 背景取樣（renderer+gpu footprint + ps rss）到 stop
function startSampler(file, rendPid, gpuPid, intervalS = 0.2, durS = 120) {
  const p = spawn('footprint', ['--noCategories', '-f', 'bytes', '--sample', String(intervalS), '--sample-duration', String(durS), '-p', String(rendPid), '-p', String(gpuPid)], { stdio: ['ignore', fs.openSync(S + '/out/' + file, 'w'), 'ignore'] });
  return p;
}
function parseSamples(file) {
  const txt = fs.readFileSync(S + '/out/' + file, 'utf8'); const series = {};
  for (const l of txt.split('\n')) { const m = l.match(/\[(\d+)\]: .*Footprint: (\d+) B/); if (m) (series[m[1]] ||= []).push(+m[2] / 1048576); }
  return Object.fromEntries(Object.entries(series).map(([k, v]) => [k, { n: v.length, max: +Math.max(...v).toFixed(1), min: +Math.min(...v).toFixed(1), last: +v[v.length - 1].toFixed(1) }]));
}

async function abortIfBad(tag) { const g = guard(); if (!g.ok) { log(OUT, { label: 'GUARD-TRIP', tag, ...g }); killMyChrome(); process.exit(3); } return g; }

async function canvasListeners() {
  const r = await pc.send('Runtime.evaluate', { expression: 'window.__flightArcDebug.map.getCanvas()' });
  const l = await pc.send('DOMDebugger.getEventListeners', { objectId: r.result.objectId });
  const cnt = {}; for (const x of l.listeners) cnt[x.type] = (cnt[x.type] || 0) + 1;
  await pc.send('Runtime.releaseObject', { objectId: r.result.objectId });
  return cnt;
}
async function protoIds() {
  const a = await pc.send('Runtime.evaluate', { expression: 'Object.getPrototypeOf(window.__flightArcDebug.scene)' });
  const b = await pc.send('Runtime.evaluate', { expression: 'Object.getPrototypeOf(window.__flightArcDebug.scene.renderer)' });
  return { scene: a.result.objectId, renderer: b.result.objectId };
}
async function countInstances(protoId) {
  const q = await pc.send('Runtime.queryObjects', { prototypeObjectId: protoId });
  const r = await pc.send('Runtime.callFunctionOn', { objectId: q.objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true });
  await pc.send('Runtime.releaseObject', { objectId: q.objects.objectId });
  return r.result.value;
}
async function setStyle(id) {
  await E(`window.__flightArcDebug.setMapStyle('${id}'); 1`); await sleep(800);
  const t0 = Date.now(); while (Date.now() - t0 < 30000) { try { if (await E(`window.__flightArcDebug.map.isStyleLoaded()`)) break; } catch {} await sleep(300); }
  await sleep(500); return waitStable();
}
async function cpuWindow(seconds) {
  const a = await procInfo(bc); const t0 = Date.now(); await sleep(seconds * 1000); const b = await procInfo(bc); const dt = (Date.now() - t0) / 1000;
  const rmap = Object.fromEntries(a.renderers.map(r => [r.pid, r.cpu]));
  const rend = b.renderers.map(r => [r.pid, +(100 * (r.cpu - (rmap[r.pid] ?? r.cpu)) / dt).toFixed(1)]).sort((x, y) => y[1] - x[1]);
  return { dt: +dt.toFixed(1), gpuCpuPct: +(100 * (b.gpu.cpu - a.gpu.cpu) / dt).toFixed(1), browserCpuPct: +(100 * (b.browser.cpu - a.browser.cpu) / dt).toFixed(1), rendererCpuPct: rend };
}

try {
  await abortIfBad('start');
  if (mode === 'probe') {
    await snap('blank-tab', { url: 'about:blank' });
    log(OUT, { label: 'nav', stable: await navigateFresh() });
    const env = await E(`({dpr: devicePixelRatio, inner:[innerWidth, innerHeight], outer:[outerWidth, outerHeight], screen:[screen.width, screen.height], ua: navigator.userAgent, vis: document.visibilityState, canvas: [window.__flightArcDebug.map.getCanvas().width, window.__flightArcDebug.map.getCanvas().height], terrain: !!window.__flightArcDebug.map.getTerrain(), deviceMemory: navigator.deviceMemory})`);
    log(OUT, { label: 'env', env, sys: sysState() });
    await E(`window.__flightArcDebug.timeline.pause(); 1`); await sleep(1000);
    const before = await snap('default-loaded-paused');
    await E(`(() => { const a = new Float32Array(50_000_000); for (let i = 0; i < a.length; i += 1) a[i] = i * 0.5; window.__probe = a; return a.length; })()`);
    const withP = await snap('probe-200MB');
    await E(`delete window.__probe; 1`);
    const after = await snap('probe-deleted');
    log(OUT, { label: 'probe-result', dHeap: +(withP.JSHeapUsedMB - before.JSHeapUsedMB).toFixed(1), dRenderer: +(withP.rendererMB - before.rendererMB).toFixed(1), dHeapUsageUsed: withP.heapUsage && before.heapUsage ? Object.fromEntries(Object.keys(withP.heapUsage).map(k => [k, +(withP.heapUsage[k] - before.heapUsage[k]).toFixed(1)])) : null, afterDelete: { dHeap: +(after.JSHeapUsedMB - before.JSHeapUsedMB).toFixed(1), dRenderer: +(after.rendererMB - before.rendererMB).toFixed(1) } });
  }

  if (mode === 'ta') {
    // 場景：S2 亞太樞紐（apac-hub）
    log(OUT, { label: 'nav', stable: await navigateFresh() });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    await E(`var d = window.__flightArcDebug; d.applySavedSet(d.builtinSets.find(s => s.id === 'apac-hub')); 1`);
    log(OUT, { label: 'set-apac', stable: await waitStable(180000) });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    const P = await protoIds();
    const extra = async (i, style, st) => ({ i, style, stable: st, listeners: await canvasListeners(), flightScenes: await countInstances(P.scene), webglRenderers: await countInstances(P.renderer), consoleHitsSoFar: consoleHits.length });
    await snap('ta-0-initial', await extra(0, 'dark', null));
    const seq = ['light', 'dark', 'light', 'dark', 'light', 'dark', 'light', 'dark', 'light', 'dark', 'light'];
    for (let i = 0; i < seq.length; i++) {
      await abortIfBad('ta-' + (i + 1));
      const st = await setStyle(seq[i]);
      await sleep(1000);
      await snap('ta-' + (i + 1), await extra(i + 1, seq[i], st));
    }
    log(OUT, { label: 'console', hits: consoleHits });
  }

  if (mode === 'world') {
    log(OUT, { label: 'nav', stable: await navigateFresh() });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    await E(`window.__lt = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: false }); 1`);
    const pre = await snap('world-pre (default scene)');
    const { pi, rend } = await pids();
    const samp = startSampler('world-samples.txt', rend.pid, pi.gpu.pid, 0.2, 150);
    const t0 = Date.now();
    await E(`var d = window.__flightArcDebug; d.exitSetMode && d.exitSetMode(); d.setScope('region'); 1`); await sleep(600);
    await E(`var d = window.__flightArcDebug; d.setRegion('all'); d.setFarView(true); setTimeout(() => d.map.jumpTo({ center: [110, 25], zoom: 3, pitch: 0, bearing: 0 }), 300); 1`);
    // 每 2s 檢查護欄
    let st; const tS = Date.now();
    const guardLoop = (async () => { while (!st) { const g = guard(); if (!g.ok) { log(OUT, { label: 'GUARD-TRIP', tag: 'world-load', ...g }); samp.kill(); killMyChrome(); process.exit(3); } await sleep(2000); } })();
    st = await waitStable(240000);
    const loadMs = Date.now() - t0;
    await sleep(1500);
    samp.kill('SIGINT'); await sleep(500);
    const lt = await E(`window.__lt`);
    const ltSum = { n: lt.length, maxMs: lt.reduce((a, x) => Math.max(a, x[1]), 0), over1s: lt.filter(x => x[1] > 1000).length, totalMs: lt.reduce((a, x) => a + x[1], 0), top: [...lt].sort((a, b) => b[1] - a[1]).slice(0, 10) };
    log(OUT, { label: 'world-load', loadMs, stable: st, longtasks: ltSum, samples: parseSamples('world-samples.txt'), rendererPid: rend.pid, gpuPid: pi.gpu.pid });
    await snap('world-steady', { loadMs });
    // 播放 30s → 暫停 40s
    await E(`window.__flightArcDebug.timeline.setSpeed(60); window.__flightArcDebug.timeline.play(); 1`);
    await sleep(2000);
    const playCpu = await cpuWindow(28);
    log(OUT, { label: 'world-playing-cpu', ...playCpu });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    const p0 = await cpuWindow(10);
    log(OUT, { label: 'world-paused-0-10s-cpu', ...p0 });
    await sleep(22000);
    const p32 = await cpuWindow(8);
    log(OUT, { label: 'world-paused-32-40s-cpu', ...p32 });
    await snap('world-after-play', {});
    log(OUT, { label: 'console', hits: consoleHits });
  }

  if (mode === 's1s2') {
    log(OUT, { label: 'nav', stable: await navigateFresh() });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    await snap('default-loaded');
    await E(`var d = window.__flightArcDebug; d.exitSetMode && d.exitSetMode(); d.setScope('airport'); d.setRegion('TW'); 1`); await sleep(600);
    await E(`window.__flightArcDebug.selectAirportSingle('RCTP'); 1`);
    log(OUT, { label: 's1', stable: await waitStable() });
    await snap('S1-RCTP');
    await abortIfBad('s2');
    await E(`var d = window.__flightArcDebug; d.applySavedSet(d.builtinSets.find(s => s.id === 'apac-hub')); 1`);
    log(OUT, { label: 's2', stable: await waitStable(180000) });
    await snap('S2-apac-fit');
    await E(`window.__flightArcDebug.map.jumpTo({ center: [121.23, 25.08], zoom: 10.2 }); 1`);
    await sleep(2500);
    log(OUT, { label: 's2-zoom', stable: await waitStable(180000) });
    await snap('S2-apac-z10.2');
    // 播放 30 s → 暫停 40 s（S2 拉近）
    await E(`window.__flightArcDebug.timeline.setSpeed(60); window.__flightArcDebug.timeline.play(); 1`);
    await sleep(2000);
    log(OUT, { label: 's2-playing-cpu', ...(await cpuWindow(28)) });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    log(OUT, { label: 's2-paused-0-10s-cpu', ...(await cpuWindow(10)) });
    await sleep(22000);
    log(OUT, { label: 's2-paused-32-40s-cpu', ...(await cpuWindow(8)) });
    log(OUT, { label: 'console', hits: consoleHits });
  }

  if (mode === 'tg') {
    log(OUT, { label: 'nav', stable: await navigateFresh() });
    await E(`window.__flightArcDebug.timeline.pause(); 1`);
    const { pi, rend } = await pids();
    const samp = startSampler('tg-samples.txt', rend.pid, pi.gpu.pid, 0.25, 900);
    const steps = [
      ['ap', 'RCTP'], ['set', 'apac-hub'], ['ap', 'VHHH'], ['set', 'eu-lhr'], ['ap', 'RCTP'], ['set', 'tw-intl'],
      ['set', 'transatlantic'], ['set', 'apac-hub'], ['set', 'london-cluster'], ['ap', 'RJTT'], ['set', 'eu-lhr'], ['set', 'apac-hub'],
    ];
    const P = await protoIds();
    await snap('tg-0-default', { flightScenes: await countInstances(P.scene) });
    let i = 0;
    for (const [k, v] of steps) {
      i++; await abortIfBad('tg-' + i);
      const js = k === 'ap' ? `var d = window.__flightArcDebug; d.exitSetMode && d.exitSetMode(); d.setScope('airport'); d.selectAirportSingle('${v}'); 1`
        : `var d = window.__flightArcDebug; d.applySavedSet(d.builtinSets.find(s => s.id === '${v}')); 1`;
      const t0 = Date.now();
      await E(js); await sleep(1500);
      const st = await waitStable(180000);
      await E(`window.__flightArcDebug.timeline.pause(); 1`);
      await snap('tg-' + i + '-' + k + ':' + v, { stable: st, switchMs: Date.now() - t0, flightScenes: await countInstances(P.scene), webglRenderers: await countInstances(P.renderer) });
    }
    samp.kill('SIGINT'); await sleep(500);
    log(OUT, { label: 'tg-samples', samples: parseSamples('tg-samples.txt') });
    log(OUT, { label: 'console', hits: consoleHits });
  }
} catch (e) {
  log(OUT, { label: 'ERROR', err: String(e.stack || e).slice(0, 800) });
} finally { pc.close(); bc.close(); }
process.exit(0);
