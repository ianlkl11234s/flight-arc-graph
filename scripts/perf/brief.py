import json,sys
d=json.load(open(sys.argv[1]))
m=d['mainThread']; g=d['gpu']; f=d['fireAnimationFrame']; l=d['longTasks']; s=d.get('sys') or {}
print(f"{d.get('label','?'):48s} fps={d['fps']:5.1f} main={m['busyMsPerSec']:6.1f}ms/s ({m['busyPct']:.0f}%) perFrame total={m['perFrame']['total']} script={m['perFrame']['scripting']} render={m['perFrame']['rendering']} gc={m['perFrame']['gc']} other={m['perFrame']['other']} | FAF avg={f['avgMs']} p95={f['p95Ms']} max={f['maxMs']} | GPUTask={g['gpuTaskMsPerSec']}ms/s {g['msPerFrame']}ms/f | long={l['count']} max={l['maxMs']} | gpuHW={s.get('gpuHw',{}).get('deviceUtilAvgPct')}% proc={[(p['type'],p['cpuPct']) for p in s.get('chromeProcCpuPct',[])[:2]]} | loss={d.get('dataLossOccurred')}")
