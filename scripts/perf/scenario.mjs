// 場景設定：node scenario.mjs <s1|s2|s3|s4|pause|play|glow0|glow08|status|trails|terrain-off|terrain-on|mouse-away|stats>
import { connectPage, evalJs, sleep } from './cdplib.mjs';
const cmd = process.argv[2];
const c = await connectPage();
const ev = (js) => evalJs(c, js);
const stats = () => ev(`(() => { const d = window.__flightArcDebug; const cv = d.map.getCanvas(); const fl = d.getFlights(); const r = d.scene.renderer.info.render; return { flights: fl.length, points: fl.reduce((a,f)=>a+f.path.length,0), three: { calls: r.calls, lines: r.lines, triangles: r.triangles, points: r.points }, heapMB: +(performance.memory.usedJSHeapSize/1048576).toFixed(1), dpr: devicePixelRatio, canvas: [cv.width, cv.height], terrain: !!d.map.getTerrain(), zoom: +d.map.getZoom().toFixed(2), pitch: d.map.getPitch(), center: d.map.getCenter(), activeOrbs: d.scene.activeOrbCount, staticBuilding: d.scene.isStaticBuilding(), time: d.getTime(), state: d.state }; })()`);
// 等 flights 數量與 staticBuilding 穩定
async function waitStable(maxMs = 60000) {
  let last = -1, stableFor = 0, t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await ev(`(() => { const d = window.__flightArcDebug; return [d.getFlights().length, d.scene.isStaticBuilding() || d.map.isMoving() || !d.map.areTilesLoaded(), document.visibilityState]; })()`);
    if (s[0] > 0 && s[0] === last && !s[1]) { stableFor += 1000; if (stableFor >= 3000) return s; } else { stableFor = 0; }
    last = s[0]; await sleep(1000);
  }
  return ['timeout', last];
}
try {
  switch (cmd) {
    case 's1': await ev(`window.__flightArcDebug.exitSetMode && window.__flightArcDebug.exitSetMode(); window.__flightArcDebug.setScope('airport'); window.__flightArcDebug.setRegion('TW'); 1`); await sleep(500); await ev(`window.__flightArcDebug.selectAirportSingle('RCTP'); 1`); console.log('stable', await waitStable()); break;
    case 's2': await ev(`const d = window.__flightArcDebug; d.applySavedSet(d.builtinSets.find(s => s.id === 'apac-hub')); 1`); console.log('stable', await waitStable()); break;
    case 's3': await ev(`window.__flightArcDebug.setScope('region'); 1`); await sleep(500); await ev(`window.__flightArcDebug.setRegion('all'); 1`); console.log('stable', await waitStable(90000)); break;
    case 's4': await ev(`window.__flightArcDebug.selectAirportSingle('RCTP'); 1`); await sleep(1500);
      for (const i of ['VHHH', 'RJTT', 'WSSS']) { await ev(`window.__flightArcDebug.toggleAirportInSet('${i}'); 1`); await sleep(1500); }
      console.log('stable', await waitStable()); break;
    case 'pause': await ev(`window.__flightArcDebug.timeline.pause(); 1`); await sleep(1500); break;
    case 'play': await ev(`window.__flightArcDebug.timeline.setSpeed(60); window.__flightArcDebug.timeline.play(); 1`); await sleep(1500); break;
    case 'glow0': await ev(`window.__flightArcDebug.setAirportGlow(0); 1`); await sleep(1500); break;
    case 'glow08': await ev(`window.__flightArcDebug.setAirportGlow(0.8); 1`); await sleep(1500); break;
    case 'status': await ev(`window.__flightArcDebug.setDisplayMode('status'); 1`); await sleep(1500); break;
    case 'trails': await ev(`window.__flightArcDebug.setDisplayMode('trails'); 1`); console.log('stable', await waitStable()); break;
    case 'terrain-off': await ev(`window.__flightArcDebug.map.setTerrain(null); 1`); await sleep(2500); break;
    case 'terrain-on': await ev(`window.__flightArcDebug.map.setTerrain({source:'mapbox-dem', exaggeration:1.5}); 1`); await sleep(2500); break;
    case 'mouse-away': {
      // 把滑鼠移到視窗左上角（sidebar icon rail 上），並對 canvas 派發 mouseout
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
      await ev(`window.__flightArcDebug.map.getCanvas().dispatchEvent(new MouseEvent('mouseout', {bubbles:true})); 1`);
      break;
    }
    case 'stats': break;
    case 'reload': { await c.send('Page.reload', { ignoreCache: false }); await sleep(3000);
      for (let i = 0; i < 60; i++) { try { const ok = await ev(`!!(window.__flightArcDebug && window.__flightArcDebug.map && window.__flightArcDebug.scene && window.__flightArcDebug.getFlights().length > 0)`); if (ok) break; } catch {} await sleep(1000); }
      console.log('stable', await waitStable()); break; }
    case 'seek-empty': await ev(`window.__flightArcDebug.timeline.pause(); window.__flightArcDebug.timeline.seek(${process.argv[3] || 0}); 1`); await sleep(1500); break;
    case 'wait': console.log('stable', await waitStable()); break;
    default: throw new Error('unknown cmd ' + cmd);
  }
  console.log(JSON.stringify(await stats()));
} finally { c.close(); }
