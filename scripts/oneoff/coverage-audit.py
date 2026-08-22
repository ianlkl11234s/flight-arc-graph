"""
coverage-audit.py — 機場資料完整度稽核（唯讀，不打 API、不改任何檔）

用途：用專案既有規則（該台灣日 done >= 50 且 done/scheduled >= 0.8）重算「哪些機場算抓滿」。
存在理由：scripts/build-core-airports.ts 只讀 legacy 的 flight-list.json，
         漏掉 Top-1000 戰役的新格式班表 scripts/flights/{ICAO}/{date}.json，
         導致 manifest 的 complete 低報（2026-08-22 實測 74 vs 實際 191）。
         修好 build-core-airports 後這支就只是交叉驗證工具。

Usage: python3 scripts/oneoff/coverage-audit.py
詳見 docs/backlog/airport-selection-ux.md
"""
import json, os, datetime
base='/Users/migu/Desktop/資料庫/gen_ai_try/ichef_工作用/GIS/plan-art/scripts'
done=set()
with open(f'{base}/track-done.ndjson') as f:
    for line in f:
        line=line.strip()
        if line: done.add(line)
def tw(iso):
    d=datetime.datetime.fromisoformat(iso.replace('Z','+00:00'))+datetime.timedelta(hours=8)
    return d.strftime('%Y-%m-%d')
# 收集所有班次（新格式 scripts/flights/*/*.json ∪ legacy flight-list.json），按 fr24_id 去重
flights={}
fd=f'{base}/flights'
for icao in os.listdir(fd):
    p=f'{fd}/{icao}'
    if not os.path.isdir(p): continue
    for fn in os.listdir(p):
        if not fn.endswith('.json'): continue
        try: data=json.load(open(f'{p}/{fn}'))
        except Exception: continue
        arr = data.get('flights', data) if isinstance(data,dict) else data
        for f_ in arr:
            fid=f_.get('fr24_id')
            if fid: flights[fid]=f_
legacy=json.load(open(f'{base}/flight-list.json'))
for f_ in legacy.get('flights',[]):
    fid=f_.get('fr24_id')
    if fid and fid not in flights: flights[fid]=f_
print('班次總數(去重):', len(flights))
stats={}
for fid,f_ in flights.items():
    ts=f_.get('datetime_takeoff') or f_.get('first_seen')
    if not ts: continue
    try: date=tw(ts)
    except Exception: continue
    isdone = fid in done
    for icao in [f_.get('orig_icao'), f_.get('dest_icao')]:
        if not icao: continue
        s=stats.setdefault(icao,{}).setdefault(date,[0,0])
        s[0]+=1
        if isdone: s[1]+=1
full={}
for icao,byd in stats.items():
    fds=[d for d,(sc,dn) in byd.items() if dn>=50 and sc and dn/sc>=0.8]
    if fds: full[icao]=fds
print('至少一天「抓滿」的機場數:', len(full))
d218=[i for i,f_ in full.items() if '2026-02-18' in f_]
print('2026-02-18 抓滿的機場數:', len(d218))
# 100% 且 >=50 班
perfect=[i for i,byd in stats.items() if '2026-02-18' in byd and byd['2026-02-18'][0]>=50 and byd['2026-02-18'][1]==byd['2026-02-18'][0]]
print('2/18 完全零缺口(100%, >=50班):', len(perfect))
# 分級門檻分佈
import collections
b=collections.Counter()
for icao,byd in stats.items():
    sc,dn = byd.get('2026-02-18',[0,0])
    if sc==0: continue
    r=dn/sc
    b['100%' if r==1 else '>=80%' if r>=0.8 else '>=50%' if r>=0.5 else '>=20%' if r>=0.2 else '<20%']+=1
print('2/18 各機場完成率分佈:', dict(b))
