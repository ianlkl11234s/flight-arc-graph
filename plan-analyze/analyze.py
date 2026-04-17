#!/usr/bin/env python3
"""
Flight data analysis script.
Reads ../scripts/flight-list.json and generates 13 analysis JSON files in data/.
"""

import json
import os
import sys
import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

# ── Constants ──────────────────────────────────────────────────────────────

TPE_TZ = timezone(timedelta(hours=8))

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, "..", "scripts", "flight-list.json")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "data")

ICAO_COUNTRY_MAP = {
    "RC": "Taiwan",
    "RJ": "Japan", "RO": "Japan",
    "RK": "South Korea",
    "RP": "Philippines",
    "VH": "Hong Kong",
    "VM": "Macau",
    "ZB": "China", "ZG": "China", "ZH": "China", "ZS": "China",
    "ZU": "China", "ZP": "China", "ZW": "China", "ZL": "China", "ZJ": "China",
    "WS": "Singapore",
    "WM": "Malaysia", "WB": "Malaysia",
    "VT": "Thailand",
    "VV": "Vietnam",
    "WA": "Indonesia", "WI": "Indonesia", "WR": "Indonesia",
    "VQ": "India", "VA": "India", "VE": "India", "VI": "India", "VO": "India",
    "UA": "Kazakhstan/Central Asia",
    "UH": "Russia", "UE": "Russia", "UL": "Russia", "UU": "Russia", "UR": "Russia",
    "EG": "United Kingdom",
    "LF": "France",
    "ED": "Germany",
    "PA": "USA", "PH": "USA", "PG": "USA", "K": "USA",
    "CY": "Canada", "CZ": "Canada",
    "NZ": "New Zealand",
    "YM": "Australia", "YB": "Australia", "YS": "Australia",
    "OE": "Saudi Arabia",
    "OT": "Qatar",
    "OM": "UAE",
    "OI": "Iran",
    "OO": "Oman",
    "VR": "Maldives",
    "VC": "Sri Lanka",
    "VG": "Bangladesh",
    "DG": "Ghana",
}

AIRLINE_NAMES = {
    "CAL": "China Airlines",
    "EVA": "EVA Air",
    "SJX": "StarLux",
    "TTW": "Tigerair Taiwan",
    "APJ": "Peach",
    "CPA": "Cathay Pacific",
    "TGW": "Scoot",
    "ANA": "ANA",
    "JAL": "Japan Airlines",
    "KAL": "Korean Air",
    "AAR": "Asiana",
    "CES": "China Eastern",
    "CSN": "China Southern",
    "CCA": "Air China",
    "SIA": "Singapore Airlines",
    "THA": "Thai Airways",
    "HVN": "Vietnam Airlines",
    "VJC": "VietJet",
    "MAS": "Malaysia Airlines",
    "FDX": "FedEx",
    "UPS": "UPS",
    "CKS": "China Airlines Cargo",
    "GIA": "Garuda Indonesia",
    "PAL": "Philippine Airlines",
    "UAL": "United Airlines",
    "DAL": "Delta",
    "AAL": "American Airlines",
}

ICAO_DISPLAY_NAMES: dict[str, str] = {
    # Taiwan
    "RCTP": "TPE 桃園", "RCSS": "TSA 松山", "RCKH": "KHH 高雄",
    "RCNN": "TTT 臺東", "RCBS": "KNH 金門", "RCFG": "LZN 南竿",
    "RCMT": "MFK 北竿", "RCQC": "MZG 馬公", "RCWA": "WOT 望安",
    "RCCM": "CMJ 七美", "RCGI": "GNI 綠島", "RCLY": "KYD 蘭嶼",
    "RCKW": "HCN 恆春", "RCMQ": "RMQ 臺中", "RCYU": "HUN 花蓮",
    "RCFN": "TNN 臺南", "RCKU": "CYI 嘉義", "RCDC": "PIF 屏東",
    # Taiwan military
    "RCAY": "RCAY 岡山", "RCPO": "RCPO 屏東空軍", "RCSQ": "RCSQ 清泉崗", "RCQS": "RCQS 志航",
    # Japan
    "RJTT": "HND 羽田", "RJAA": "NRT 成田", "RJBB": "KIX 關西",
    "RJOO": "ITM 伊丹", "RJFF": "FUK 福岡", "RJCC": "CTS 新千歲",
    "ROAH": "OKA 那霸", "RJGG": "NGO 中部", "RJSS": "SDJ 仙台",
    "RJSN": "KIJ 新潟", "RJNK": "KMQ 小松", "RJOH": "MYJ 松山(日)",
    "RJFK": "KOJ 鹿兒島", "RJOT": "TAK 高松", "RJOM": "MYJ 松山(日)",
    "RJOB": "HIJ 廣島", "RJFT": "KMI 熊本", "RJFM": "MMY 宮古",
    "RJNA": "NKM 名古屋小牧", "ROIG": "ISG 石垣",
    # Korea
    "RKSI": "ICN 仁川", "RKSS": "GMP 金浦", "RKPK": "PUS 釜山",
    "RKPC": "CJU 濟州", "RKTN": "TAE 大邱",
    # China
    "ZSPD": "PVG 浦東", "ZSSS": "SHA 虹橋", "ZBAA": "PEK 北京首都",
    "ZGGG": "CAN 廣州", "ZGSZ": "SZX 深圳", "ZUUU": "CTU 成都",
    "ZHCC": "CGO 鄭州", "ZLXY": "XIY 西安", "ZUCK": "CKG 重慶",
    "ZSNJ": "NKG 南京", "ZSAM": "XMN 廈門", "ZSFZ": "FOC 福州",
    "ZGHA": "CSX 長沙", "ZWWW": "URC 烏魯木齊",
    # Southeast Asia
    "VTBS": "BKK 曼谷", "VVNB": "HAN 河內", "VVTS": "SGN 胡志明",
    "WSSS": "SIN 新加坡", "RPLL": "MNL 馬尼拉", "WMKK": "KUL 吉隆坡",
    "WIII": "CGK 雅加達", "VDPP": "PNH 金邊", "VTSP": "HKT 普吉",
    # Hong Kong / Macau
    "VHHH": "HKG 香港", "VMMC": "MFM 澳門",
    # Americas
    "KLAX": "LAX 洛杉磯", "KJFK": "JFK 紐約", "KSFO": "SFO 舊金山",
    "PANC": "ANC 安克拉治", "CYYZ": "YYZ 多倫多",
    # Europe
    "EGLL": "LHR 倫敦", "LFPG": "CDG 巴黎", "EHAM": "AMS 阿姆斯特丹",
    "EDDF": "FRA 法蘭克福", "LIRF": "FCO 羅馬", "LEMD": "MAD 馬德里",
    "EGKK": "LGW 蓋威克", "LOWW": "VIE 維也納", "LKPR": "PRG 布拉格",
    "LTFM": "IST 伊斯坦堡",
    # Middle East
    "OMDB": "DXB 杜拜", "OTHH": "DOH 多哈", "OEJN": "JED 吉達",
    "OBBI": "BAH 巴林",
    # South Asia
    "VIDP": "DEL 新德里", "VOMM": "MAA 乘奈",
    # Oceania
    "YBBN": "BNE 布里斯班", "YSSY": "SYD 雪梨", "YMML": "MEL 墨爾本",
    "NZAA": "AKL 奧克蘭",
    # Additional SE Asia
    "WMSA": "SZB 梳邦", "VTBD": "DMK 曼谷廊曼", "RPVM": "CEB 宿霧",
    "VLPS": "LPQ 龍坡邦", "VYYY": "RGN 仰光", "WADD": "DPS 峇里島",
    # Additional Japan
    "RJCH": "HKD 函館", "RJOA": "HIJ 廣島", "RJAF": "MMJ 松本",
    "RJNS": "SHZ 靜岡", "RJNW": "NTQ 能登", "RJFO": "OIT 大分",
    "RJFR": "KKJ 北九州", "RJFU": "NGS 長崎", "RJFE": "FUJ 五島",
    "RJKA": "ASJ 奄美", "RJFC": "KMJ 宮崎", "RJOI": "IWK 岩國",
    "RJTF": "RJTF 調布",
    # Additional China
    "ZBTJ": "TSN 天津", "ZPPP": "KMG 昆明", "ZGNN": "NNG 南寧",
    "ZGOW": "SWA 汕頭", "ZJHK": "HAK 海口", "ZJSY": "SYX 三亞",
    "ZSQD": "TAO 青島", "ZSWZ": "WNZ 溫州", "ZSHC": "HGH 杭州",
    "ZSNB": "NGB 寧波", "ZSWH": "WUH 武漢",
    # Additional Americas
    "KORD": "ORD 芝加哥", "KATL": "ATL 亞特蘭大", "KSEA": "SEA 西雅圖",
    "KDFW": "DFW 達拉斯", "PHNL": "HNL 檀香山",
}

CARGO_CALLSIGN_PREFIXES = {"FDX", "UPS", "CKS", "GTI", "CLX", "ABW", "SQC", "CAO", "BOX"}

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


# ── Helpers ────────────────────────────────────────────────────────────────

def log(msg: str):
    print(msg, file=sys.stderr)


def parse_utc(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def to_tpe(dt: datetime) -> datetime:
    return dt.astimezone(TPE_TZ)


def icao_to_country(icao: str) -> str:
    if not icao:
        return "Unknown"
    # Try 2-char prefix first
    prefix2 = icao[:2]
    if prefix2 in ICAO_COUNTRY_MAP:
        return ICAO_COUNTRY_MAP[prefix2]
    # US airports: K prefix + 3 letters
    if icao[0] == "K" and len(icao) == 4:
        return "USA"
    # Try single char
    prefix1 = icao[0]
    if prefix1 in ICAO_COUNTRY_MAP:
        return ICAO_COUNTRY_MAP[prefix1]
    return f"Unknown ({prefix2})"


def display_name(icao: str) -> str:
    """Return human-readable display name for an ICAO code, fallback to code itself."""
    return ICAO_DISPLAY_NAMES.get(icao, icao)


def display_route(orig: str, dest: str) -> str:
    """Convert 'RCTP-VHHH' style route to 'TPE 桃園→HKG 香港'."""
    return f"{display_name(orig)}→{display_name(dest)}"


def get_airline(flight: dict) -> str:
    return flight.get("operating_as") or flight.get("painted_as") or ""


def route_key(orig: str, dest: str) -> str:
    return f"{orig}-{dest}"


def save_json(filename: str, data):
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    log(f"  -> Saved {filename}")


# ── Load Data ─────────────────────────────────────────────────────────────

def load_flights() -> list[dict]:
    log(f"Loading {INPUT_FILE}")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        raw = json.load(f)
    flights = raw.get("flights", [])
    log(f"  Total raw flights: {len(flights)}")

    # Parse and filter
    valid = []
    for fl in flights:
        takeoff = parse_utc(fl.get("datetime_takeoff"))
        if not takeoff:
            continue
        landed = parse_utc(fl.get("datetime_landed"))
        fl["_takeoff"] = takeoff
        fl["_landed"] = landed
        fl["_takeoff_tpe"] = to_tpe(takeoff)
        fl["_landed_tpe"] = to_tpe(landed) if landed else None
        fl["_orig"] = fl.get("orig_icao") or ""
        fl["_dest"] = fl.get("dest_icao") or ""
        fl["_dest_actual"] = fl.get("dest_icao_actual") or ""
        fl["_airline"] = get_airline(fl)
        fl["_reg"] = fl.get("reg") or ""
        fl["_type"] = fl.get("type") or ""
        fl["_callsign"] = fl.get("callsign") or ""
        fl["_flight"] = fl.get("flight") or ""
        if fl["_orig"] and fl["_dest"]:
            fl["_route"] = route_key(fl["_orig"], fl["_dest"])
        else:
            fl["_route"] = ""
        valid.append(fl)

    log(f"  Valid flights (with takeoff time): {len(valid)}")
    return valid


# ── Analysis 1: CAL vs EVA ────────────────────────────────────────────────

def analyze_cal_vs_eva(flights: list[dict]):
    log("Analyzing 01: CAL vs EVA route overlap...")

    # Taiwan departures only
    tw_dep = [f for f in flights if f["_orig"].startswith("RC")]

    # Count date range for avgPerDay
    dates = set()
    for f in tw_dep:
        dates.add(f["_takeoff_tpe"].date())
    num_days = max(len(dates), 1)

    cal_routes: dict[str, int] = Counter()
    eva_routes: dict[str, int] = Counter()
    all_route_airlines: dict[str, Counter] = defaultdict(Counter)

    for f in tw_dep:
        airline = f["_airline"]
        route = f["_route"]
        if not route:
            continue
        all_route_airlines[route][airline] += 1
        if airline == "CAL":
            cal_routes[route] += 1
        elif airline == "EVA":
            eva_routes[route] += 1

    cal_set = set(cal_routes.keys())
    eva_set = set(eva_routes.keys())
    overlap_set = cal_set & eva_set
    cal_only_set = cal_set - eva_set
    eva_only_set = eva_set - cal_set

    def make_route_list(routes: dict[str, int]):
        result_list = []
        for r, c in routes.items():
            parts = r.split("-")
            orig_icao = parts[0] if len(parts) == 2 else ""
            dest_icao = parts[1] if len(parts) == 2 else ""
            result_list.append({
                "route": display_route(orig_icao, dest_icao) if orig_icao and dest_icao else r,
                "route_icao": r,
                "dest": display_name(dest_icao) if dest_icao else "",
                "dest_icao": dest_icao,
                "count": c,
                "avgPerDay": round(c / num_days, 2),
            })
        result_list.sort(key=lambda x: -x["count"])
        return result_list

    overlap = []
    for r in sorted(overlap_set):
        others = [{"code": a, "count": c} for a, c in all_route_airlines[r].items() if a not in ("CAL", "EVA")]
        others.sort(key=lambda x: -x["count"])
        parts = r.split("-")
        overlap.append({
            "route": display_route(parts[0], parts[1]) if len(parts) == 2 else r,
            "route_icao": r,
            "calCount": cal_routes[r],
            "evaCount": eva_routes[r],
            "ratio": round(cal_routes[r] / max(eva_routes[r], 1), 2),
            "otherAirlines": others,
        })
    overlap.sort(key=lambda x: -(x["calCount"] + x["evaCount"]))

    cal_only = make_route_list({r: cal_routes[r] for r in cal_only_set})
    eva_only = make_route_list({r: eva_routes[r] for r in eva_only_set})

    result = {
        "dateRange": f"{min(dates).isoformat()} ~ {max(dates).isoformat()}",
        "numDays": num_days,
        "calRoutes": make_route_list(cal_routes),
        "evaRoutes": make_route_list(eva_routes),
        "overlap": overlap,
        "calOnly": cal_only,
        "evaOnly": eva_only,
        "summary": {
            "calTotal": sum(cal_routes.values()),
            "evaTotal": sum(eva_routes.values()),
            "overlapCount": len(overlap_set),
            "calOnlyCount": len(cal_only_set),
            "evaOnlyCount": len(eva_only_set),
        }
    }
    save_json("01_cal_vs_eva.json", result)


# ── Analysis 2: RCTP Waves ────────────────────────────────────────────────

def analyze_rctp_waves(flights: list[dict]):
    log("Analyzing 02: RCTP departure/arrival waves...")

    # All flights involving RCTP
    hourly_dep = Counter()
    hourly_arr = Counter()
    quarter_dep: dict[tuple[int, int], int] = Counter()
    quarter_arr: dict[tuple[int, int], int] = Counter()

    dep_dates = set()
    arr_dates = set()

    for f in flights:
        if f["_orig"] == "RCTP":
            t = f["_takeoff_tpe"]
            hourly_dep[t.hour] += 1
            quarter_dep[(t.hour, t.minute // 15)] += 1
            dep_dates.add(t.date())
        if f["_dest_actual"] == "RCTP" or (not f["_dest_actual"] and f["_dest"] == "RCTP"):
            if f["_landed_tpe"]:
                t = f["_landed_tpe"]
                hourly_arr[t.hour] += 1
                quarter_arr[(t.hour, t.minute // 15)] += 1
                arr_dates.add(t.date())

    num_dep_days = max(len(dep_dates), 1)
    num_arr_days = max(len(arr_dates), 1)

    hourly = []
    for h in range(24):
        hourly.append({"hour": h, "dep": hourly_dep.get(h, 0), "arr": hourly_arr.get(h, 0)})

    quarter = []
    for h in range(24):
        for q in range(4):
            quarter.append({
                "hour": h, "quarter": q,
                "timeLabel": f"{h:02d}:{q*15:02d}",
                "dep": quarter_dep.get((h, q), 0),
                "arr": quarter_arr.get((h, q), 0),
            })

    # Detect waves: local maxima in 15-min with total > 10
    waves = []
    for i, slot in enumerate(quarter):
        total = slot["dep"] + slot["arr"]
        if total <= 10:
            continue
        prev_total = quarter[i - 1]["dep"] + quarter[i - 1]["arr"] if i > 0 else 0
        next_total = quarter[i + 1]["dep"] + quarter[i + 1]["arr"] if i < len(quarter) - 1 else 0
        if total >= prev_total and total >= next_total:
            wave_type = "mixed"
            if slot["dep"] > slot["arr"] * 2:
                wave_type = "departure"
            elif slot["arr"] > slot["dep"] * 2:
                wave_type = "arrival"
            waves.append({
                "peakTime": slot["timeLabel"],
                "depCount": slot["dep"],
                "arrCount": slot["arr"],
                "type": wave_type,
            })

    # Gaps between waves
    gaps = []
    for i in range(1, len(waves)):
        from_time = waves[i - 1]["peakTime"]
        to_time = waves[i]["peakTime"]
        from_min = int(from_time[:2]) * 60 + int(from_time[3:])
        to_min = int(to_time[:2]) * 60 + int(to_time[3:])
        dur = to_min - from_min
        if dur > 0:
            gaps.append({"from": from_time, "to": to_time, "durationMin": dur})

    result = {
        "hourly": hourly,
        "quarter": quarter,
        "waves": waves,
        "gaps": gaps,
        "avgDaily": {
            "dep": round(sum(hourly_dep.values()) / num_dep_days, 1),
            "arr": round(sum(hourly_arr.values()) / num_arr_days, 1),
        },
        "totalDays": {"dep": num_dep_days, "arr": num_arr_days},
    }
    save_json("02_rctp_waves.json", result)


# ── Analysis 3: Aircraft Utilization ──────────────────────────────────────

def analyze_aircraft_util(flights: list[dict]):
    log("Analyzing 03: Aircraft utilization...")

    by_reg: dict[str, list[dict]] = defaultdict(list)
    for f in flights:
        if f["_reg"]:
            by_reg[f["_reg"]].append(f)

    aircraft_stats = []
    busiest_day = {"reg": "", "date": "", "legs": 0, "flights": []}

    for reg, reg_flights in by_reg.items():
        reg_flights.sort(key=lambda x: x["_takeoff"])
        airline = reg_flights[0]["_airline"]
        ac_type = reg_flights[0]["_type"]

        # Group by date (Taipei time)
        by_date: dict[str, list[dict]] = defaultdict(list)
        for f in reg_flights:
            d = f["_takeoff_tpe"].strftime("%Y-%m-%d")
            by_date[d].append(f)

        num_days = len(by_date)
        total_legs = len(reg_flights)
        avg_legs = round(total_legs / max(num_days, 1), 2)

        # Top routes
        route_counter = Counter(f["_route"] for f in reg_flights if f["_route"])
        top_routes = []
        for r, _ in route_counter.most_common(5):
            parts = r.split("-")
            top_routes.append(display_route(parts[0], parts[1]) if len(parts) == 2 else r)

        # Total flight time
        total_minutes = 0
        for f in reg_flights:
            if f["_takeoff"] and f["_landed"]:
                total_minutes += (f["_landed"] - f["_takeoff"]).total_seconds() / 60

        aircraft_stats.append({
            "reg": reg,
            "type": ac_type,
            "airline": airline,
            "avgLegsPerDay": avg_legs,
            "totalLegs": total_legs,
            "totalDays": num_days,
            "totalFlightHours": round(total_minutes / 60, 1),
            "routes": top_routes,
        })

        # Check busiest day
        for d, d_flights in by_date.items():
            if len(d_flights) > busiest_day["legs"]:
                busiest_day = {
                    "reg": reg,
                    "date": d,
                    "legs": len(d_flights),
                    "type": ac_type,
                    "airline": airline,
                    "flights": [
                        {
                            "callsign": f["_callsign"],
                            "flight": f["_flight"],
                            "from": display_name(f["_orig"]),
                            "from_icao": f["_orig"],
                            "to": display_name(f["_dest"]),
                            "to_icao": f["_dest"],
                            "depTime": f["_takeoff_tpe"].strftime("%H:%M"),
                            "arrTime": f["_landed_tpe"].strftime("%H:%M") if f["_landed_tpe"] else None,
                        }
                        for f in sorted(d_flights, key=lambda x: x["_takeoff"])
                    ],
                }

    # Top 20 by avg legs per day
    aircraft_stats.sort(key=lambda x: -x["avgLegsPerDay"])
    top20 = aircraft_stats[:20]

    result = {
        "topAircraft": top20,
        "busiestDay": busiest_day,
        "totalUniqueAircraft": len(by_reg),
    }
    save_json("03_aircraft_utilization.json", result)


# ── Analysis 4: Weekday vs Weekend ────────────────────────────────────────

def analyze_weekday_weekend(flights: list[dict]):
    log("Analyzing 04: Weekday vs Weekend...")

    tw_dep = [f for f in flights if f["_orig"].startswith("RC")]

    # Day of week counts
    dow_counts = Counter()
    dow_dates: dict[int, set] = defaultdict(set)
    route_dow: dict[str, Counter] = defaultdict(Counter)
    airport_dow: dict[str, Counter] = defaultdict(Counter)

    for f in tw_dep:
        t = f["_takeoff_tpe"]
        dow = t.weekday()  # 0=Mon
        d = t.date()
        dow_counts[dow] += 1
        dow_dates[dow].add(d)
        if f["_route"]:
            wd_type = "weekday" if dow < 5 else "weekend"
            route_dow[f["_route"]][wd_type] += 1
        airport_dow[f["_orig"]][dow] += 1

    # By day of week
    by_dow = []
    for dow in range(7):
        n_days = max(len(dow_dates.get(dow, set())), 1)
        by_dow.append({
            "day": dow,
            "dayName": DAY_NAMES[dow],
            "count": dow_counts.get(dow, 0),
            "numDays": len(dow_dates.get(dow, set())),
            "avgFlights": round(dow_counts.get(dow, 0) / n_days, 1),
        })

    # Weekday/weekend averages
    wd_total = sum(dow_counts.get(d, 0) for d in range(5))
    we_total = sum(dow_counts.get(d, 0) for d in range(5, 7))
    wd_days = sum(len(dow_dates.get(d, set())) for d in range(5))
    we_days = sum(len(dow_dates.get(d, set())) for d in range(5, 7))
    wd_avg = round(wd_total / max(wd_days, 1), 1)
    we_avg = round(we_total / max(we_days, 1), 1)

    # Weekend-only routes
    weekend_only = []
    weekday_heavy = []
    for route, counts in route_dow.items():
        wd = counts.get("weekday", 0)
        we = counts.get("weekend", 0)
        wd_per_day = wd / max(wd_days, 1)
        we_per_day = we / max(we_days, 1)
        parts = route.split("-")
        route_display = display_route(parts[0], parts[1]) if len(parts) == 2 else route
        if wd == 0 and we > 0:
            weekend_only.append({"route": route_display, "route_icao": route, "weekendCount": we})
        elif wd_per_day > 0 and we_per_day > 0:
            ratio = round(wd_per_day / we_per_day, 2)
            if ratio > 2.0:
                weekday_heavy.append({
                    "route": route_display,
                    "route_icao": route,
                    "weekdayAvg": round(wd_per_day, 2),
                    "weekendAvg": round(we_per_day, 2),
                    "ratio": ratio,
                })

    weekend_only.sort(key=lambda x: -x["weekendCount"])
    weekday_heavy.sort(key=lambda x: -x["ratio"])

    # Airport comparison
    airport_cmp = []
    for icao, counts in airport_dow.items():
        wd_c = sum(counts.get(d, 0) for d in range(5))
        we_c = sum(counts.get(d, 0) for d in range(5, 7))
        airport_cmp.append({
            "airport": display_name(icao),
            "icao": icao,
            "weekdayAvg": round(wd_c / max(wd_days, 1), 1),
            "weekendAvg": round(we_c / max(we_days, 1), 1),
        })
    airport_cmp.sort(key=lambda x: -(x["weekdayAvg"] + x["weekendAvg"]))

    result = {
        "byDayOfWeek": by_dow,
        "weekdayAvg": wd_avg,
        "weekendAvg": we_avg,
        "ratio": round(wd_avg / max(we_avg, 0.1), 2),
        "weekendOnlyRoutes": weekend_only,
        "weekdayHeavyRoutes": weekday_heavy[:30],
        "airportComparison": airport_cmp,
    }
    save_json("04_weekday_vs_weekend.json", result)


# ── Analysis 5: Diversions ────────────────────────────────────────────────

def analyze_diversions(flights: list[dict]):
    log("Analyzing 05: Diversions...")

    diversions = []
    for f in flights:
        planned = f["_dest"]
        actual = f["_dest_actual"]
        if not planned or not actual:
            continue
        if planned != actual:
            diversions.append({
                "date": f["_takeoff_tpe"].strftime("%Y-%m-%d"),
                "time": f["_takeoff_tpe"].strftime("%H:%M"),
                "flight": f["_flight"],
                "callsign": f["_callsign"],
                "airline": f["_airline"],
                "orig": display_name(f["_orig"]),
                "orig_icao": f["_orig"],
                "plannedDest": display_name(planned),
                "plannedDest_icao": planned,
                "actualDest": display_name(actual),
                "actualDest_icao": actual,
                "type": f["_type"],
                "reg": f["_reg"],
            })

    diversions.sort(key=lambda x: (x["date"], x["time"]))

    # By actual destination
    by_dest: dict[str, list] = defaultdict(list)
    for d in diversions:
        by_dest[d["actualDest_icao"]].append(d["flight"])
    by_actual_dest = sorted(
        [{"airport": display_name(icao), "icao": icao, "count": len(fl), "flights": fl[:10]} for icao, fl in by_dest.items()],
        key=lambda x: -x["count"]
    )

    # Clusters by date (potential weather events)
    by_date: dict[str, list] = defaultdict(list)
    for d in diversions:
        by_date[d["date"]].append(d)
    clusters = []
    for date, d_list in sorted(by_date.items()):
        if len(d_list) >= 2:
            common_dest_icao = Counter(d["actualDest_icao"] for d in d_list).most_common(1)
            cd_icao = common_dest_icao[0][0] if common_dest_icao else ""
            clusters.append({
                "date": date,
                "count": len(d_list),
                "commonDest": display_name(cd_icao) if cd_icao else "",
                "commonDest_icao": cd_icao,
                "flights": [d["flight"] for d in d_list[:10]],
            })
    clusters.sort(key=lambda x: -x["count"])

    total_flights = len(flights)
    result = {
        "diversions": diversions,
        "byActualDest": by_actual_dest,
        "byCause": clusters,
        "total": len(diversions),
        "rate": f"{len(diversions)/max(total_flights,1)*100:.2f}%",
        "totalFlightsAnalyzed": total_flights,
    }
    save_json("05_diversions.json", result)


# ── Analysis 6: Route Network ─────────────────────────────────────────────

def analyze_route_network(flights: list[dict]):
    log("Analyzing 06: Route network structure...")

    tw_dep = [f for f in flights if f["_orig"].startswith("RC")]

    # By country
    country_routes: dict[str, Counter] = defaultdict(Counter)
    country_flights: dict[str, int] = Counter()
    route_airlines: dict[str, Counter] = defaultdict(Counter)

    for f in tw_dep:
        dest = f["_dest"]
        if not dest:
            continue
        country = icao_to_country(dest)
        country_flights[country] += 1
        country_routes[country][dest] += 1
        if f["_route"] and f["_airline"]:
            route_airlines[f["_route"]][f["_airline"]] += 1

    by_country = []
    for country, count in country_flights.most_common():
        top_dests = country_routes[country].most_common(5)
        by_country.append({
            "country": country,
            "flights": count,
            "routes": len(country_routes[country]),
            "topDest": [{"airport": display_name(d), "icao": d, "count": c} for d, c in top_dests],
        })

    # Domestic vs international
    domestic_flights = [f for f in tw_dep if f["_dest"].startswith("RC")]
    intl_flights = [f for f in tw_dep if f["_dest"] and not f["_dest"].startswith("RC")]

    domestic_routes = Counter(f["_route"] for f in domestic_flights if f["_route"])
    intl_routes_set = set(f["_route"] for f in intl_flights if f["_route"])

    # Monopoly routes (single airline, 5+ flights)
    monopoly = []
    competitive = []
    for route, airlines in route_airlines.items():
        parts = route.split("-")
        route_disp = display_route(parts[0], parts[1]) if len(parts) == 2 else route
        if len(airlines) == 1:
            airline, count = list(airlines.items())[0]
            if count >= 5:
                monopoly.append({"route": route_disp, "route_icao": route, "airline": airline, "count": count})
        elif len(airlines) >= 3:
            airline_list = sorted(
                [{"code": a, "count": c} for a, c in airlines.items()],
                key=lambda x: -x["count"]
            )
            competitive.append({
                "route": route_disp,
                "route_icao": route,
                "airlines": airline_list,
                "totalAirlines": len(airlines),
            })

    monopoly.sort(key=lambda x: -x["count"])
    competitive.sort(key=lambda x: -x["totalAirlines"])

    # Longest routes by flight duration
    route_durations: dict[str, list[float]] = defaultdict(list)
    for f in tw_dep:
        if f["_takeoff"] and f["_landed"] and f["_route"]:
            dur = (f["_landed"] - f["_takeoff"]).total_seconds() / 60
            if 10 < dur < 1500:  # sanity check
                route_durations[f["_route"]].append(dur)

    longest = []
    for route, durs in route_durations.items():
        avg_dur = sum(durs) / len(durs)
        top_airline = route_airlines[route].most_common(1)
        parts = route.split("-")
        longest.append({
            "route": display_route(parts[0], parts[1]) if len(parts) == 2 else route,
            "route_icao": route,
            "avgDurationMin": round(avg_dur, 1),
            "airline": top_airline[0][0] if top_airline else "",
            "flights": len(durs),
        })
    longest.sort(key=lambda x: -x["avgDurationMin"])

    result = {
        "byCountry": by_country,
        "domestic": {
            "flights": len(domestic_flights),
            "routes": len(domestic_routes),
            "topRoutes": [
                {
                    "route": display_route(*r.split("-")) if "-" in r else r,
                    "route_icao": r,
                    "count": c,
                }
                for r, c in domestic_routes.most_common(10)
            ],
        },
        "international": {
            "flights": len(intl_flights),
            "routes": len(intl_routes_set),
        },
        "monopolyRoutes": monopoly[:30],
        "competitiveRoutes": competitive[:20],
        "longestRoutes": longest[:20],
    }
    save_json("06_route_network.json", result)


# ── Analysis 7: Night Operations ──────────────────────────────────────────

def analyze_night_ops(flights: list[dict]):
    log("Analyzing 07: Night operations (00:00-06:00 TPE)...")

    night_flights = []
    hourly_dep = Counter()
    hourly_arr = Counter()
    by_airport: dict[str, dict[str, int]] = defaultdict(lambda: {"dep": 0, "arr": 0})
    route_counter: dict[str, dict] = {}

    total_tw = 0
    for f in flights:
        is_tw_orig = f["_orig"].startswith("RC")
        is_tw_dest = f["_dest_actual"].startswith("RC") if f["_dest_actual"] else f["_dest"].startswith("RC")

        if not (is_tw_orig or is_tw_dest):
            continue
        total_tw += 1

        dep_hour = f["_takeoff_tpe"].hour
        arr_hour = f["_landed_tpe"].hour if f["_landed_tpe"] else None

        is_night_dep = is_tw_orig and dep_hour < 6
        is_night_arr = is_tw_dest and arr_hour is not None and arr_hour < 6

        if not (is_night_dep or is_night_arr):
            continue

        # Categorize
        callsign_prefix = f["_callsign"][:3] if f["_callsign"] else ""
        airline = f["_airline"]
        if callsign_prefix in CARGO_CALLSIGN_PREFIXES or airline in CARGO_CALLSIGN_PREFIXES:
            category = "cargo"
        elif f["_orig"].startswith("RC") and f["_orig"] in ("RCAY", "RCPO", "RCSQ", "RCQS"):
            category = "military"
        elif f["_dest"].startswith("RC") and f["_dest"] in ("RCAY", "RCPO", "RCSQ", "RCQS"):
            category = "military"
        else:
            category = "red-eye"

        if is_night_dep:
            hourly_dep[dep_hour] += 1
            if is_tw_orig:
                by_airport[f["_orig"]]["dep"] += 1

        if is_night_arr:
            hourly_arr[arr_hour] += 1
            dest = f["_dest_actual"] or f["_dest"]
            if is_tw_dest:
                by_airport[dest]["arr"] += 1

        route = f["_route"]
        if route and route not in route_counter:
            parts = route.split("-")
            route_disp = display_route(parts[0], parts[1]) if len(parts) == 2 else route
            route_counter[route] = {"route": route_disp, "route_icao": route, "count": 0, "airline": airline, "category": category}
        if route:
            route_counter[route]["count"] += 1

        night_flights.append(category)

    # Hourly summary
    hourly = [{"hour": h, "dep": hourly_dep.get(h, 0), "arr": hourly_arr.get(h, 0)} for h in range(6)]

    # By category
    cat_counter = Counter(night_flights)
    total_night = len(night_flights)
    by_category = [
        {"category": cat, "count": c, "pct": f"{c/max(total_night,1)*100:.1f}%"}
        for cat, c in cat_counter.most_common()
    ]

    # By airport
    airport_list = sorted(
        [{"airport": display_name(icao), "icao": icao, "nightDep": v["dep"], "nightArr": v["arr"]} for icao, v in by_airport.items()],
        key=lambda x: -(x["nightDep"] + x["nightArr"])
    )

    # Top night routes
    top_routes = sorted(route_counter.values(), key=lambda x: -x["count"])[:20]

    result = {
        "nightFlights": hourly,
        "byCategory": by_category,
        "byAirport": airport_list,
        "topNightRoutes": top_routes,
        "total": total_night,
        "pctOfAll": f"{total_night/max(total_tw,1)*100:.2f}%",
    }
    save_json("07_night_ops.json", result)


# ── Analysis 8: Asymmetric Routes ────────────────────────────────────────

def analyze_asymmetric_routes(flights: list[dict]):
    log("Analyzing 08: Asymmetric routes...")

    # Only Taiwan-related flights
    tw_flights = [f for f in flights if f["_orig"].startswith("RC") or f["_dest"].startswith("RC")]

    # Count A→B for each directed route
    directed: Counter = Counter()
    for f in tw_flights:
        if f["_orig"] and f["_dest"]:
            directed[(f["_orig"], f["_dest"])] += 1

    # Build undirected pairs
    seen = set()
    routes = []
    for (a, b), count_ab in directed.items():
        pair = tuple(sorted([a, b]))
        if pair in seen:
            continue
        seen.add(pair)
        airport_a, airport_b = pair
        a_to_b = directed.get((airport_a, airport_b), 0)
        b_to_a = directed.get((airport_b, airport_a), 0)
        total = a_to_b + b_to_a
        if total <= 10:
            continue
        max_count = max(a_to_b, b_to_a)
        diff = abs(a_to_b - b_to_a)
        ratio = round(diff / max_count, 3) if max_count > 0 else 0
        if ratio > 0.3:
            routes.append({
                "airportA": airport_a,
                "airportB": airport_b,
                "aToB": a_to_b,
                "bToA": b_to_a,
                "diff": diff,
                "ratio": ratio,
                "routeA": display_route(airport_a, airport_b),
                "routeB": display_route(airport_b, airport_a),
            })

    routes.sort(key=lambda x: -x["diff"])

    most_asym = routes[0] if routes else None
    result = {
        "routes": routes,
        "summary": {
            "totalPairs": len(seen),
            "asymmetricCount": len(routes),
            "mostAsymmetric": f"{most_asym['routeA']} (diff={most_asym['diff']})" if most_asym else "N/A",
        }
    }
    save_json("08_asymmetric_routes.json", result)


# ── Analysis 9: LCC vs Legacy ───────────────────────────────────────────

LCC_CODES = {"TTW", "APJ", "TGW", "JST", "TWB", "JNA", "ESR", "ABL", "ADO", "AXM", "VJC", "CEB"}
LEGACY_CODES = {"CAL", "EVA", "SJX", "CPA", "ANA", "JAL", "KAL", "AAR", "CCA", "CSN", "CES", "SIA", "THA", "MAS", "PAL"}

AIRLINE_DISPLAY_NAMES = {
    "CAL": "華航", "EVA": "長榮", "SJX": "星宇", "TTW": "虎航",
    "CPA": "國泰", "ANA": "全日空", "JAL": "日航", "KAL": "大韓",
    "AAR": "韓亞", "APJ": "樂桃", "TGW": "酷航", "JST": "捷星",
    "TWB": "德威", "JNA": "真航", "CCA": "國航", "CSN": "南航",
    "CES": "東航", "SIA": "新航", "THA": "泰航", "MAS": "馬航",
    "ABL": "釜山", "ADO": "Air Do", "AXM": "亞航", "VJC": "越捷",
    "CEB": "宿霧太平洋", "PAL": "菲律賓航空", "ESR": "易斯達",
    "MDA": "華信", "UIA": "立榮",
}


def analyze_lcc_vs_legacy(flights: list[dict]):
    log("Analyzing 09: LCC vs Legacy...")

    tw_dep = [f for f in flights if f["_orig"].startswith("RC")]

    lcc_flights = []
    legacy_flights = []
    other_flights = []

    for f in tw_dep:
        airline = f["_airline"]
        if airline in LCC_CODES:
            lcc_flights.append(f)
        elif airline in LEGACY_CODES:
            legacy_flights.append(f)
        else:
            other_flights.append(f)

    total = len(tw_dep)

    def group_stats(group_flights, label):
        airline_counter = Counter(f["_airline"] for f in group_flights)
        route_counter = Counter(f["_route"] for f in group_flights if f["_route"])
        airlines = []
        for code, count in airline_counter.most_common():
            airlines.append({
                "code": code,
                "name": AIRLINE_DISPLAY_NAMES.get(code, code),
                "count": count,
            })
        top_routes = []
        for r, c in route_counter.most_common(15):
            parts = r.split("-")
            top_routes.append({
                "route": display_route(parts[0], parts[1]) if len(parts) == 2 else r,
                "count": c,
            })
        return {
            "total": len(group_flights),
            "pct": f"{len(group_flights)/max(total,1)*100:.1f}%",
            "airlines": airlines,
            "topRoutes": top_routes,
        }

    lcc_stats = group_stats(lcc_flights, "LCC")
    legacy_stats = group_stats(legacy_flights, "Legacy")

    # Route overlap
    lcc_route_airlines: dict[str, Counter] = defaultdict(Counter)
    legacy_route_airlines: dict[str, Counter] = defaultdict(Counter)
    for f in lcc_flights:
        if f["_route"]:
            lcc_route_airlines[f["_route"]][f["_airline"]] += 1
    for f in legacy_flights:
        if f["_route"]:
            legacy_route_airlines[f["_route"]][f["_airline"]] += 1

    overlap_routes = set(lcc_route_airlines.keys()) & set(legacy_route_airlines.keys())
    overlap = []
    for r in overlap_routes:
        parts = r.split("-")
        lcc_count = sum(lcc_route_airlines[r].values())
        legacy_count = sum(legacy_route_airlines[r].values())
        lcc_al = [AIRLINE_DISPLAY_NAMES.get(a, a) for a in lcc_route_airlines[r]]
        legacy_al = [AIRLINE_DISPLAY_NAMES.get(a, a) for a in legacy_route_airlines[r]]
        overlap.append({
            "route": display_route(parts[0], parts[1]) if len(parts) == 2 else r,
            "lccCount": lcc_count,
            "legacyCount": legacy_count,
            "lccAirlines": lcc_al,
            "legacyAirlines": legacy_al,
        })
    overlap.sort(key=lambda x: -(x["lccCount"] + x["legacyCount"]))

    result = {
        "lcc": lcc_stats,
        "legacy": legacy_stats,
        "overlap": overlap,
        "summary": {
            "lccPct": f"{len(lcc_flights)/max(total,1)*100:.1f}%",
            "legacyPct": f"{len(legacy_flights)/max(total,1)*100:.1f}%",
            "otherPct": f"{len(other_flights)/max(total,1)*100:.1f}%",
            "overlapRoutes": len(overlap),
        }
    }
    save_json("09_lcc_vs_legacy.json", result)


# ── Analysis 10: Codeshare & Wet Lease ───────────────────────────────────

def analyze_codeshare(flights: list[dict]):
    log("Analyzing 10: Codeshare & wet lease...")

    codeshare_flights = []
    for f in flights:
        op = f.get("operating_as") or ""
        pt = f.get("painted_as") or ""
        if op and pt and op != pt:
            codeshare_flights.append(f)

    total = len(flights)
    cs_count = len(codeshare_flights)

    # Group by operator→marketer pair
    pair_counter: Counter = Counter()
    pair_routes: dict[tuple, Counter] = defaultdict(Counter)
    for f in codeshare_flights:
        op = f.get("operating_as", "")
        pt = f.get("painted_as", "")
        pair = (op, pt)
        pair_counter[pair] += 1
        if f["_route"]:
            pair_routes[pair][f["_route"]] += 1

    codeshares = []
    for (op, pt), count in pair_counter.most_common():
        top_routes = []
        for r, c in pair_routes[(op, pt)].most_common(5):
            parts = r.split("-")
            top_routes.append({
                "route": display_route(parts[0], parts[1]) if len(parts) == 2 else r,
                "count": c,
            })
        codeshares.append({
            "operator": op,
            "marketer": pt,
            "count": count,
            "topRoutes": top_routes,
        })

    top_pairs = [{"pair": f"{op}→{pt}", "count": c} for (op, pt), c in pair_counter.most_common(10)]

    # Also check flight field vs callsign prefix mismatch
    callsign_mismatch = 0
    for f in flights:
        flight_prefix = f["_flight"][:3] if len(f["_flight"]) >= 3 else ""
        cs_prefix = f["_callsign"][:3] if len(f["_callsign"]) >= 3 else ""
        if flight_prefix and cs_prefix and flight_prefix != cs_prefix:
            callsign_mismatch += 1

    result = {
        "codeshares": codeshares,
        "totalCodeshare": cs_count,
        "pct": f"{cs_count/max(total,1)*100:.2f}%",
        "topPairs": top_pairs,
        "callsignMismatch": callsign_mismatch,
        "summary": f"{cs_count} codeshare flights ({cs_count/max(total,1)*100:.1f}% of total), "
                   f"{len(pair_counter)} unique operator→marketer pairs, "
                   f"{callsign_mismatch} callsign prefix mismatches",
    }
    save_json("10_codeshare.json", result)


# ── Analysis 11: Islands ─────────────────────────────────────────────────

ISLAND_AIRPORTS = {"RCBS", "RCQC", "RCFG", "RCMT", "RCWA", "RCCM", "RCGI", "RCLY"}
MAINLAND_TW = {"RCTP", "RCSS", "RCKH", "RCNN", "RCMQ", "RCYU", "RCFN", "RCKU", "RCDC", "RCKW",
               "RCAY", "RCPO", "RCSQ", "RCQS"}


def analyze_islands(flights: list[dict]):
    log("Analyzing 11: Island airport connectivity...")

    # All flights touching an island airport
    island_flights = [f for f in flights if f["_orig"] in ISLAND_AIRPORTS or f["_dest"] in ISLAND_AIRPORTS]

    # Domestic flights (both RC*)
    domestic_flights = [f for f in flights if f["_orig"].startswith("RC") and f["_dest"].startswith("RC")]

    # Collect dates for avg daily
    all_dates = set()
    for f in flights:
        all_dates.add(f["_takeoff_tpe"].date())
    num_days = max(len(all_dates), 1)

    islands_data = []
    cross_island: Counter = Counter()

    for icao in sorted(ISLAND_AIRPORTS):
        # Flights departing or arriving this island
        my_flights = [f for f in flights if f["_orig"] == icao or f["_dest"] == icao]
        if not my_flights:
            continue

        # Connections
        conn_counter: dict[str, dict] = {}
        airline_counter: Counter = Counter()
        hourly: Counter = Counter()

        for f in my_flights:
            airline_counter[f["_airline"]] += 1
            if f["_orig"] == icao:
                dest = f["_dest"]
                hourly[f["_takeoff_tpe"].hour] += 1
            else:
                dest = f["_orig"]
                if f["_landed_tpe"]:
                    hourly[f["_landed_tpe"].hour] += 1

            if dest not in conn_counter:
                conn_counter[dest] = {"dest": dest, "destName": display_name(dest), "count": 0, "airlines": set()}
            conn_counter[dest]["count"] += 1
            conn_counter[dest]["airlines"].add(f["_airline"])

        connections = []
        for dest, info in conn_counter.items():
            connections.append({
                "dest": info["dest"],
                "destName": info["destName"],
                "count": info["count"],
                "airlines": sorted(info["airlines"]),
            })
        connections.sort(key=lambda x: -x["count"])

        # Peak hour
        peak_hour = hourly.most_common(1)[0][0] if hourly else 0

        airlines = [{"code": a, "count": c} for a, c in airline_counter.most_common()]

        islands_data.append({
            "icao": icao,
            "airport": display_name(icao),
            "totalFlights": len(my_flights),
            "avgDaily": round(len(my_flights) / num_days, 1),
            "connections": connections,
            "peakHour": peak_hour,
            "airlines": airlines,
        })

        # Cross-island connections
        for f in my_flights:
            other = f["_dest"] if f["_orig"] == icao else f["_orig"]
            if other in ISLAND_AIRPORTS:
                pair = tuple(sorted([icao, other]))
                cross_island[pair] += 1

    # De-dup cross-island (counted from both sides)
    cross_island_list = []
    seen_pairs = set()
    for (a, b), count in cross_island.most_common():
        pair = (a, b)
        if pair not in seen_pairs:
            seen_pairs.add(pair)
            cross_island_list.append({
                "route": f"{display_name(a)}↔{display_name(b)}",
                "count": count // 2 if count > 1 else count,  # counted from both sides
            })

    total_island = len(island_flights)
    total_domestic = len(domestic_flights)

    result = {
        "islands": islands_data,
        "crossIsland": cross_island_list,
        "summary": {
            "totalIslandFlights": total_island,
            "pctOfDomestic": f"{total_island/max(total_domestic,1)*100:.1f}%",
        }
    }
    save_json("11_islands.json", result)


# ── Analysis 12: Rare Aircraft Types ─────────────────────────────────────

MILITARY_TYPES = {"P8", "P3", "P3C", "C130", "C17", "C5", "KC135", "E3", "E2",
                  "B350", "DRON", "F16", "F15", "F18", "C2", "H60", "V22",
                  "P8A", "C30J", "C130J", "GLF5", "GLF4", "C56X", "B752"}
MILITARY_CALLSIGN_PREFIXES = {"RCH", "NAVY", "AIR", "CNV", "BAF", "PAT", "EVY"}


def analyze_rare_aircraft(flights: list[dict]):
    log("Analyzing 12: Rare aircraft types...")

    type_counter: Counter = Counter()
    type_flights: dict[str, list[dict]] = defaultdict(list)

    for f in flights:
        ac_type = f["_type"]
        if not ac_type:
            continue
        type_counter[ac_type] += 1
        type_flights[ac_type].append(f)

    rare_types = []
    for ac_type, count in type_counter.items():
        if count >= 20:
            continue

        # Categorize
        callsigns = [f["_callsign"] for f in type_flights[ac_type]]
        cs_prefixes = set(cs[:3] for cs in callsigns if len(cs) >= 3)

        if ac_type.upper() in MILITARY_TYPES or cs_prefixes & MILITARY_CALLSIGN_PREFIXES:
            category = "military"
        elif any(kw in ac_type.upper() for kw in ["GLF", "CL60", "G280", "FA7X", "FA8X", "GLEX"]):
            category = "government/VIP"
        elif count <= 2:
            category = "charter/test"
        else:
            category = "unusual commercial"

        flight_details = []
        for f in sorted(type_flights[ac_type], key=lambda x: x["_takeoff"]):
            parts = f["_route"].split("-") if f["_route"] else []
            route_disp = display_route(parts[0], parts[1]) if len(parts) == 2 else f["_route"]
            flight_details.append({
                "date": f["_takeoff_tpe"].strftime("%Y-%m-%d"),
                "callsign": f["_callsign"],
                "route": route_disp,
                "reg": f["_reg"],
            })

        rare_types.append({
            "type": ac_type,
            "count": count,
            "category": category,
            "flights": flight_details,
        })

    rare_types.sort(key=lambda x: x["count"])

    # Summary by category
    cat_counter: Counter = Counter()
    total_rare = 0
    for rt in rare_types:
        cat_counter[rt["category"]] += rt["count"]
        total_rare += rt["count"]
    categories = [{"category": c, "count": n} for c, n in cat_counter.most_common()]

    result = {
        "rareTypes": rare_types,
        "summary": {
            "totalRareFlights": total_rare,
            "categories": categories,
        }
    }
    save_json("12_rare_aircraft.json", result)


# ── Analysis 13: Daily Trend ─────────────────────────────────────────────

def analyze_daily_trend(flights: list[dict]):
    log("Analyzing 13: Daily trend (39-day)...")

    # Taiwan departures
    tw_flights = [f for f in flights if f["_orig"].startswith("RC") or f["_dest"].startswith("RC")]

    daily_dep: Counter = Counter()
    daily_arr: Counter = Counter()
    daily_total: Counter = Counter()

    for f in tw_flights:
        d = f["_takeoff_tpe"].strftime("%Y-%m-%d")
        daily_total[d] += 1
        if f["_orig"].startswith("RC"):
            daily_dep[d] += 1
        if f["_dest"].startswith("RC"):
            daily_arr[d] += 1

    # Sort dates
    all_dates = sorted(daily_total.keys())
    if not all_dates:
        save_json("13_daily_trend.json", {"daily": [], "anomalies": [], "weekPattern": [], "summary": {}})
        return

    # Build daily array
    daily = []
    for d_str in all_dates:
        dt = datetime.strptime(d_str, "%Y-%m-%d")
        dow = dt.weekday()
        daily.append({
            "date": d_str,
            "dayOfWeek": dow,
            "dayName": DAY_NAMES[dow],
            "total": daily_total[d_str],
            "dep": daily_dep.get(d_str, 0),
            "arr": daily_arr.get(d_str, 0),
            "ma7": None,
        })

    # 7-day moving average
    for i in range(len(daily)):
        if i >= 6:
            window = [daily[j]["total"] for j in range(i - 6, i + 1)]
            daily[i]["ma7"] = round(sum(window) / 7, 1)

    # Anomalies (>15% deviation from MA7)
    anomalies = []
    for d in daily:
        if d["ma7"] is None or d["ma7"] == 0:
            continue
        deviation = (d["total"] - d["ma7"]) / d["ma7"]
        if abs(deviation) > 0.15:
            anomalies.append({
                "date": d["date"],
                "total": d["total"],
                "ma7": d["ma7"],
                "deviation": f"{deviation*100:+.1f}%",
                "direction": "above" if deviation > 0 else "below",
            })

    # Day-of-week pattern
    dow_totals: dict[int, list[int]] = defaultdict(list)
    for d in daily:
        dow_totals[d["dayOfWeek"]].append(d["total"])

    week_pattern = []
    for dow in range(7):
        vals = dow_totals.get(dow, [])
        if not vals:
            week_pattern.append({"day": dow, "dayName": DAY_NAMES[dow], "avg": 0, "stddev": 0})
            continue
        avg = sum(vals) / len(vals)
        variance = sum((v - avg) ** 2 for v in vals) / len(vals)
        stddev = math.sqrt(variance)
        week_pattern.append({
            "day": dow,
            "dayName": DAY_NAMES[dow],
            "avg": round(avg, 1),
            "stddev": round(stddev, 1),
        })

    # Summary
    totals = [d["total"] for d in daily]
    avg_daily = round(sum(totals) / len(totals), 1)
    max_day = max(daily, key=lambda x: x["total"])
    min_day = min(daily, key=lambda x: x["total"])

    # Trend: compare first week avg vs last week avg
    first_week = totals[:7]
    last_week = totals[-7:]
    first_avg = sum(first_week) / len(first_week)
    last_avg = sum(last_week) / len(last_week)
    trend_pct = (last_avg - first_avg) / first_avg * 100 if first_avg > 0 else 0
    if trend_pct > 5:
        trend = "increasing"
    elif trend_pct < -5:
        trend = "decreasing"
    else:
        trend = "stable"

    result = {
        "daily": daily,
        "anomalies": anomalies,
        "weekPattern": week_pattern,
        "summary": {
            "avgDaily": avg_daily,
            "maxDay": {"date": max_day["date"], "total": max_day["total"]},
            "minDay": {"date": min_day["date"], "total": min_day["total"]},
            "trend": trend,
        }
    }
    save_json("13_daily_trend.json", result)


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    flights = load_flights()

    analyze_cal_vs_eva(flights)
    analyze_rctp_waves(flights)
    analyze_aircraft_util(flights)
    analyze_weekday_weekend(flights)
    analyze_diversions(flights)
    analyze_route_network(flights)
    analyze_night_ops(flights)
    analyze_asymmetric_routes(flights)
    analyze_lcc_vs_legacy(flights)
    analyze_codeshare(flights)
    analyze_islands(flights)
    analyze_rare_aircraft(flights)
    analyze_daily_trend(flights)

    log("\nAll 13 analyses complete!")


if __name__ == "__main__":
    main()
