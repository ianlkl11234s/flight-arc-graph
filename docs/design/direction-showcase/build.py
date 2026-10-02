"""重建視覺方向展示頁：抽 RCTP 2026-02-18 85 km 內軌跡 → 注入模板 → 輸出 out/flight-arc-directions.html
用法：python3 docs/design/direction-showcase/build.py   （需本機 public/tracks/airports/RCTP/2026-02-18.jsonl）
"""
import json, math, datetime, pathlib
HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[2]
LAT0, LON0, R = 25.0777, 121.2328, 85
KX = 111.32 * math.cos(math.radians(LAT0)); KY = 110.57
D0 = int(datetime.datetime(2026, 2, 18, tzinfo=datetime.timezone(datetime.timedelta(hours=8))).timestamp())
seen, fl = set(), []
for line in open(ROOT / 'public/tracks/airports/RCTP/2026-02-18.jsonl'):
    f = json.loads(line)
    if f['fr24_id'] in seen: continue
    seen.add(f['fr24_id'])
    arr, dep = f.get('dest_icao') == 'RCTP', f.get('origin_icao') == 'RCTP'
    if not (arr or dep): continue
    pts, last = [], None
    for lat, lon, alt, t in f['path']:
        x, y = (lon - LON0) * KX, (lat - LAT0) * KY
        if x * x + y * y > R * R: continue
        if last and (x - last[0]) ** 2 + (y - last[1]) ** 2 < 1.0: continue
        pts.append((x, y, alt, t)); last = (x, y)
    if len(pts) < 6: continue
    key = pts[-1][3] if arr else pts[0][3]
    if not (D0 <= key < D0 + 86400): continue
    flat = []
    for x, y, a, t in pts: flat += [round(x * 10), round(y * 10), round(max(a, 0) / 10), round((t - D0) / 10)]
    fl.append({"c": f.get('callsign') or '', "ty": f.get('aircraft_type') or '', "o": f.get('origin_icao') or f.get('origin_iata') or '',
               "d": f.get('dest_icao') or '', "a": 1 if arr else 0, "p": flat, "k": round((key - D0) / 60)})
data = json.dumps({"date": "2026-02-18", "f": fl}, separators=(',', ':'))
out = HERE / 'out'; out.mkdir(exist_ok=True)
(out / 'flight-arc-directions.html').write_text((HERE / 'directions.tpl.html').read_text().replace('__DATA__', data))
print(f"{len(fl)} flights → {out / 'flight-arc-directions.html'}")
