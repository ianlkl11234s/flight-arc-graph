// OS 層取樣：ioreg GPU 硬體使用率（每秒）+ CDP SystemInfo.getProcessInfo 的 cpuTime 差值
import { execFile } from 'node:child_process';
import { CDP } from './cdplib.mjs';
const ioreg = () => new Promise(res => execFile('ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'], { maxBuffer: 8e6 }, (err, out) => {
  if (err) return res(null);
  const g = (k) => { const m = out.match(new RegExp('"' + k + ' Utilization %"=(\\d+)')); return m ? Number(m[1]) : null; };
  res({ device: g('Device'), renderer: g('Renderer'), tiler: g('Tiler') });
}));
async function procInfo() {
  const v = await (await fetch('http://localhost:9333/json/version')).json();
  const c = await new CDP(v.webSocketDebuggerUrl).connect();
  try { const r = await c.send('SystemInfo.getProcessInfo'); return r.processInfo || r.processInfos || []; } finally { c.close(); }
}
export async function startSysSampler() {
  const t0 = Date.now(); const p0 = await procInfo(); const samples = [];
  const timer = setInterval(async () => { const s = await ioreg(); if (s) samples.push(s); }, 1000);
  return { stop: async () => {
    clearInterval(timer); const p1 = await procInfo(); const dt = (Date.now() - t0) / 1000;
    const m0 = new Map(p0.map(p => [p.id, p]));
    const deltas = p1.map(p => ({ type: p.type, pid: p.id, cpuPct: +(((p.cpuTime - (m0.get(p.id)?.cpuTime ?? p.cpuTime)) / dt) * 100).toFixed(1) })).filter(p => p.cpuPct > 1 || p.type === 'GPU' || p.type === 'browser').sort((a, b) => b.cpuPct - a.cpuPct);
    const avg = (k) => samples.length ? +(samples.reduce((a, s) => a + (s[k] ?? 0), 0) / samples.length).toFixed(0) : null;
    return { seconds: +dt.toFixed(1), gpuHw: { deviceUtilAvgPct: avg('device'), rendererUtilAvgPct: avg('renderer'), tilerUtilAvgPct: avg('tiler'), samples: samples.map(s => s.device) }, chromeProcCpuPct: deltas.slice(0, 6) };
  } };
}
