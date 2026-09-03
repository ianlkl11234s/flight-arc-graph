// 測試 #1 探針：在頁面內 patch rAF / map 'render' / triggerRepaint / longtask，取樣 N 秒
// 用法: node probe.mjs <seconds> [label]
import { connectPage, evalJs } from './cdplib.mjs';
import { startSysSampler } from './sys-sample.mjs';
const secs = Number(process.argv[2] || 5); const label = process.argv[3] || '';
const c = await connectPage();
try {
  const sys = await startSysSampler();
  const r = await evalJs(c, `(() => new Promise(resolve => {
    const d = window.__flightArcDebug; const map = d.map;
    const origRAF = window.requestAnimationFrame;
    let rafCalls = 0, rafMs = 0, rafMax = 0, renders = 0, triggers = 0, longtasks = 0, longtaskMs = 0, maxLT = 0;
    const rafDur = [];
    window.requestAnimationFrame = function(cb) { return origRAF.call(window, function(ts) { rafCalls++; const t0 = performance.now(); try { return cb(ts); } finally { const dt = performance.now() - t0; rafMs += dt; rafDur.push(dt); if (dt > rafMax) rafMax = dt; } }); };
    const onRender = () => renders++;
    map.on('render', onRender);
    const origTrig = map.triggerRepaint.bind(map);
    const callers = {};
    map.triggerRepaint = function() { triggers++; const st = (new Error().stack || '').split('\\n').slice(2); const line = st.find(l => /src\\//.test(l)) || st[0] || '?'; const m = line.match(/(src\\/[^?:]+)/); const k = m ? m[1] : line.trim().slice(0, 60); callers[k] = (callers[k] || 0) + 1; return origTrig(); };
    const po = new PerformanceObserver(list => { for (const e of list.getEntries()) { longtasks++; longtaskMs += e.duration; if (e.duration > maxLT) maxLT = e.duration; } });
    po.observe({ entryTypes: ['longtask'] });
    const three0 = Object.assign({}, d.scene.renderer.info.render);
    const t0 = performance.now(); const time0 = d.getTime();
    const vis0 = document.visibilityState;
    setTimeout(() => {
      const dt = (performance.now() - t0) / 1000;
      window.requestAnimationFrame = origRAF; map.off('render', onRender); map.triggerRepaint = origTrig; po.disconnect();
      const three1 = d.scene.renderer.info.render;
      rafDur.sort((a,b)=>a-b);
      const p = (q) => rafDur.length ? rafDur[Math.min(rafDur.length-1, Math.floor(q*rafDur.length))] : 0;
      resolve({ label: ${JSON.stringify(label)}, seconds: +dt.toFixed(2), visibility: vis0 + '/' + document.visibilityState,
        rafPerSec: +(rafCalls/dt).toFixed(1), rafCallbackMsPerSec: +(rafMs/dt).toFixed(1), rafCallbackMsAvg: +(rafCalls ? rafMs/rafCalls : 0).toFixed(2), rafCallbackMsP50: +p(0.5).toFixed(2), rafCallbackMsP95: +p(0.95).toFixed(2), rafCallbackMsMax: +rafMax.toFixed(1),
        mapRendersPerSec: +(renders/dt).toFixed(1), triggerRepaintPerSec: +(triggers/dt).toFixed(1), triggerRepaintCallers: Object.fromEntries(Object.entries(callers).map(([k,v]) => [k, +(v/dt).toFixed(1)])), threeRenderFramesPerSec: +((three1.frame - three0.frame)/dt).toFixed(1),
        longtasks, longtaskMsTotal: +longtaskMs.toFixed(1), longtaskMax: +maxLT.toFixed(1),
        timeChangedDuringSample: d.getTime() !== time0, hasActiveOrbs: d.scene.hasActiveOrbs(), activeOrbCount: d.scene.activeOrbCount, isStaticBuilding: d.scene.isStaticBuilding(),
        flights: d.getFlights().length, threeInfo: { calls: three1.calls, lines: three1.lines, triangles: three1.triangles, points: three1.points },
        heapMB: performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(1) : null, state: window.__flightArcDebug.state });
    }, ${secs * 1000});
  }))()`);
  r.sys = await sys.stop();
  console.log(JSON.stringify(r));
} finally { c.close(); }
