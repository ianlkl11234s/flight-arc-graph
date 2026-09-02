// 零依賴 CDP tracing：node cdp-trace.mjs --seconds 8 --out trace.json [--target http://localhost:5199] [--label x]
import { CDP, findPageTarget, sleep } from './cdplib.mjs';
import { writeFileSync } from 'node:fs';
import { startSysSampler } from './sys-sample.mjs';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const seconds = Number(args.seconds || 8); const out = args.out || 'trace.json'; const label = args.label || '';
import { readFileSync } from 'node:fs';
if (args.analyze) {
  const raw = readFileSync(args.analyze, 'utf8'); const parsed = JSON.parse(raw); const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
  const summary = analyze(events, seconds); summary.label = label; summary.file = args.analyze;
  try { const prev = JSON.parse(readFileSync(args.analyze.replace(/\.json$/, '') + '.summary.json', 'utf8')); summary.sys = prev.sys; summary.dataLossOccurred = prev.dataLossOccurred; } catch {}
  writeFileSync(args.analyze.replace(/\.json$/, '') + '.summary.json', JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary)); process.exit(0);
}
const target = await findPageTarget(9333, args.target || 'http://localhost:5199');
const c = await new CDP(target.webSocketDebuggerUrl).connect();
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'gpu', 'blink.user_timing', '__metadata'];
const done = c.once('Tracing.tracingComplete');
const sys = args.nosys ? null : await startSysSampler();
await c.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: CATS, recordMode: 'recordContinuously' } });
const tStart = Date.now();
await sleep(seconds * 1000);
await c.send('Tracing.end');
const { stream, dataLossOccurred } = await done;
const sysSummary = sys ? await sys.stop() : null;
const chunks = [];
for (;;) { const r = await c.send('IO.read', { handle: stream, size: 4 * 1024 * 1024 }); chunks.push(r.base64Encoded ? Buffer.from(r.data, 'base64').toString('utf8') : r.data); if (r.eof) break; }
await c.send('IO.close', { handle: stream });
c.close();
const raw = chunks.join('');
const parsed = JSON.parse(raw);
const events = Array.isArray(parsed) ? parsed : parsed.traceEvents;
writeFileSync(out, raw);
writeFileSync(out.replace(/\.json$/, '') + '.summary.json', JSON.stringify({ label, sys: sysSummary, dataLossOccurred: !!dataLossOccurred, partial: true }));
const summary = analyze(events, seconds);
summary.label = label; summary.dataLossOccurred = !!dataLossOccurred; summary.sys = sysSummary; summary.wallSeconds = (Date.now() - tStart) / 1000; summary.file = out;
writeFileSync(out.replace(/\.json$/, '') + '.summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));

export function analyze(events, seconds) {
  // 1. metadata：process / thread 名稱
  const procName = new Map(), threadName = new Map();
  for (const e of events) if (e.ph === 'M') { if (e.name === 'process_name') procName.set(e.pid, e.args.name); if (e.name === 'thread_name') threadName.set(e.pid + ':' + e.tid, e.args.name); }
  // 2. 找 renderer main thread：CrRendererMain 中 RunTask 總時長最大者
  const byThread = new Map();
  for (const e of events) { if (e.ph !== 'X') continue; const k = e.pid + ':' + e.tid; if (!byThread.has(k)) byThread.set(k, []); byThread.get(k).push(e); }
  let mainKey = null, mainDur = -1;
  for (const [k, arr] of byThread) if (threadName.get(k) === 'CrRendererMain') { const d = arr.filter(e => e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask').reduce((a, e) => a + (e.dur || 0), 0); if (d > mainDur) { mainDur = d; mainKey = k; } }
  const mainPid = mainKey ? Number(mainKey.split(':')[0]) : null;
  const main = mainKey ? byThread.get(mainKey).slice().sort((a, b) => a.ts - b.ts || (b.dur || 0) - (a.dur || 0)) : [];
  let t0 = Infinity, t1 = -Infinity;
  for (const e of events) { if (e.ph !== 'X' && e.ph !== 'I') continue; if (e.ts < t0) t0 = e.ts; const end = e.ts + (e.dur || 0); if (end > t1) t1 = end; }
  const span = (t1 - t0) / 1e6;
  // 3. self-time 歸類（stack 演算法）
  const SCRIPT = new Set(['FunctionCall', 'EvaluateScript', 'EvaluateModule', 'v8.compile', 'v8.compileModule', 'v8.run', 'V8.Execute', 'RunMicrotasks', 'TimerFire', 'EventDispatch', 'XHRReadyStateChange', 'XHRLoad', 'v8.callFunction', 'ProfileCall', 'V8.RunMicrotasks', 'ParseHTML', 'v8.evaluateModule', ]);
  const GC = new Set(['MinorGC', 'MajorGC', 'V8.GCScavenger', 'V8.GC_MC_INCREMENTAL', 'BlinkGC.AtomicPhase', 'V8.GCIncrementalMarking', 'GCEvent', 'V8.GCFinalizeMC', 'V8.GCScavenger', 'V8.GCCompactor', 'V8.GC_MC_INCREMENTAL_FINALIZE', 'V8.GC_HEAP_PROLOGUE', 'V8.GC_HEAP_EPILOGUE', 'V8.GC_TIME_TO_SAFEPOINT', 'V8.GC_MC_MARK', 'V8.GC_MC_SWEEP']);
  const isGC = (n) => GC.has(n) || /^V8\.GC|^MinorGC|^MajorGC|GC$/.test(n);
  const RENDER = new Set(['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'UpdateLayer', 'UpdateLayerTree', 'CompositeLayers', 'HitTest', 'ScheduleStyleRecalculation', 'PaintImage', 'RasterTask', 'ScrollLayer', 'Commit', 'Layerize']);
  const cat = new Map(); let topTotal = 0, runTasks = 0, longTasks = 0, longMax = 0; const longList = [];
  let fafCount = 0, fafDur = 0, fafMax = 0; const fafList = [];
  const stack = [];
  const perSecMain = new Array(Math.ceil(span) + 1).fill(0);
  for (const e of main) {
    const dur = e.dur || 0;
    while (stack.length && stack[stack.length - 1].end <= e.ts) stack.pop();
    if (stack.length) stack[stack.length - 1].child += dur; else { topTotal += dur; runTasks++; if (dur > 50000) { longTasks++; longList.push(+(dur / 1000).toFixed(1)); if (dur > longMax) longMax = dur; } perSecMain[Math.floor((e.ts - t0) / 1e6)] += dur; }
    if (e.name === 'FireAnimationFrame') { fafCount++; fafDur += dur; fafList.push(dur / 1000); if (dur > fafMax) fafMax = dur; }
    stack.push({ end: e.ts + dur, child: 0, ev: e });
    e._self = null; // 之後計算
  }
  // self time：需要第二遍——重建 stack 並在 pop 時計算
  const stack2 = [];
  const flush = (node) => { const self = (node.ev.dur || 0) - node.child; const n = node.ev.name; const k = isGC(n) ? 'gc' : SCRIPT.has(n) ? 'scripting' : RENDER.has(n) ? 'rendering' : (n === 'RunTask' || n === 'ThreadControllerImpl::RunTask') ? 'task-overhead' : 'other:' + n; cat.set(k, (cat.get(k) || 0) + self); };
  for (const e of main) {
    const dur = e.dur || 0;
    while (stack2.length && stack2[stack2.length - 1].end <= e.ts) flush(stack2.pop());
    if (stack2.length) stack2[stack2.length - 1].child += dur;
    stack2.push({ end: e.ts + dur, child: 0, ev: e });
  }
  while (stack2.length) flush(stack2.pop());
  const catMs = Object.fromEntries([...cat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / 1000).toFixed(1)]));
  const scriptingMs = Object.entries(catMs).filter(([k]) => k === 'scripting').reduce((a, [, v]) => a + v, 0);
  const renderingMs = Object.entries(catMs).filter(([k]) => k === 'rendering').reduce((a, [, v]) => a + v, 0);
  const gcMs = catMs.gc || 0;
  const otherMs = topTotal / 1000 - scriptingMs - renderingMs - gcMs;
  // 4. frames
  const drawFrames = events.filter(e => e.name === 'DrawFrame' && e.pid === mainPid);
  const beginMainFrames = events.filter(e => e.name === 'BeginMainThreadFrame' && e.pid === mainPid);
  const commits = events.filter(e => e.name === 'Commit' && e.pid === mainPid && e.ph === 'X');
  const pipeline = {}; for (const e of events) if (e.name === 'PipelineReporter' && e.pid === mainPid && e.args && e.args.chrome_frame_reporter) { const s = e.args.chrome_frame_reporter.state; pipeline[s] = (pipeline[s] || 0) + 1; }
  const perSecDraw = new Array(Math.ceil(span) + 1).fill(0); for (const e of drawFrames) perSecDraw[Math.floor((e.ts - t0) / 1e6)]++;
  // 5. GPU
  const gpuPids = [...procName.entries()].filter(([, n]) => n === 'GPU Process').map(([p]) => p);
  const gpuTasks = events.filter(e => e.name === 'GPUTask' && e.ph === 'X');
  const gpuMs = gpuTasks.reduce((a, e) => a + (e.dur || 0), 0) / 1000;
  const perSecGpu = new Array(Math.ceil(span) + 1).fill(0); for (const e of gpuTasks) perSecGpu[Math.floor((e.ts - t0) / 1e6)] += (e.dur || 0) / 1000;
  const gpuMainKey = [...byThread.keys()].find(k => threadName.get(k) === 'CrGpuMain');
  const gpuMainTop = gpuMainKey ? (() => { const arr = byThread.get(gpuMainKey).slice().sort((a, b) => a.ts - b.ts); let end = -1, tot = 0; for (const e of arr) { if (e.ts >= end) { tot += e.dur || 0; end = e.ts + (e.dur || 0); } } return tot / 1000; })() : null;
  const frames = drawFrames.length; const fps = frames / span;
  const per = (ms) => frames ? +(ms / frames).toFixed(2) : null;
  return {
    spanSeconds: +span.toFixed(2), rendererPid: mainPid, gpuPids,
    fps: +fps.toFixed(1), drawFrames: frames, beginMainThreadFrames: beginMainFrames.length, commits: commits.length, pipelineStates: pipeline, perSecondDrawFrames: perSecDraw.slice(0, Math.floor(span)),
    mainThread: { busyMsPerSec: +(topTotal / 1000 / span).toFixed(1), busyPct: +(topTotal / 1000 / span / 10).toFixed(1), tasks: runTasks, scriptingMsPerSec: +(scriptingMs / span).toFixed(1), renderingMsPerSec: +(renderingMs / span).toFixed(1), gcMsPerSec: +(gcMs / span).toFixed(1), otherMsPerSec: +(otherMs / span).toFixed(1), perFrame: { total: per(topTotal / 1000), scripting: per(scriptingMs), rendering: per(renderingMs), gc: per(gcMs), other: per(otherMs) }, perSecondBusyMs: perSecMain.slice(0, Math.floor(span)).map(v => +(v / 1000).toFixed(0)), selfTimeTop: Object.fromEntries(Object.entries(catMs).slice(0, 8)) },
    fireAnimationFrame: { count: fafCount, msPerSec: +(fafDur / 1000 / span).toFixed(1), avgMs: fafCount ? +(fafDur / 1000 / fafCount).toFixed(2) : null, maxMs: +(fafMax / 1000).toFixed(1), p95Ms: fafList.length ? +fafList.sort((a, b) => a - b)[Math.floor(fafList.length * 0.95)].toFixed(2) : null },
    longTasks: { count: longTasks, maxMs: +(longMax / 1000).toFixed(1), list: longList.slice(0, 20) },
    gpu: { gpuTaskMsPerSec: +(gpuMs / span).toFixed(1), busyPct: +(gpuMs / span / 10).toFixed(1), msPerFrame: per(gpuMs), gpuTaskCount: gpuTasks.length, perSecondMs: perSecGpu.slice(0, Math.floor(span)).map(v => +v.toFixed(0)), crGpuMainTopLevelMsPerSec: gpuMainTop === null ? null : +(gpuMainTop / span).toFixed(1) },
    eventCount: events.length,
  };
}
