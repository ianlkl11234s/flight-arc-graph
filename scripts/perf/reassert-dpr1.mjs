import { connectPage, evalJs } from './cdplib.mjs';
const c = await connectPage();
await c.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 913, deviceScaleFactor: 1, mobile: false });
await new Promise(r=>setTimeout(r,200));
const v = await evalJs(c, "window.__flightArcDebug.map.resize(); [devicePixelRatio, window.__flightArcDebug.map.getCanvas().width, window.__flightArcDebug.map.getCanvas().height, document.visibilityState]");
console.log(JSON.stringify(v));
c.close();
