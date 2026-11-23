// 平面方位投影數學（src/map/planeProjection.ts）
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createPlaneProjector,
  greatCircleKm,
  mercatorToLngLat,
  lngLatToMercator,
  projectLine,
  projectPolygons,
  rangeRing,
  PLANE_UNIT,
  EARTH_RADIUS_KM,
  GNOM_MAX_DEG,
} from "../../../src/map/planeProjection.ts";

const RCTP = [25.0777, 121.2328];
const RJTT = [35.5494, 139.7798];
const KLAX = [33.9425, -118.4081];
const D2R = Math.PI / 180;

/** 獨立算一次初始方位角（度，北=0、順時針），不共用被測程式的公式 */
function bearing(lat1, lng1, lat2, lng2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lng2 - lng1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / D2R + 360) % 360;
}
const polar = (pt) => {
  const dx = pt.x - 0.5, dy = 0.5 - pt.y; // 轉成北向上
  return { r: Math.hypot(dx, dy), az: (Math.atan2(dx, dy) / D2R + 360) % 360 };
};

test("中心點落在 (0.5, 0.5)", () => {
  for (const kind of ["aeqd", "laea", "gnom"]) {
    const out = { x: 0, y: 0 };
    assert.equal(createPlaneProjector(kind, ...RCTP).project(...RCTP, out), true);
    assert.ok(Math.abs(out.x - 0.5) < 1e-12 && Math.abs(out.y - 0.5) < 1e-12, kind);
  }
});

test("方位等距：半徑正比於大圓距離、角度等於方位角", () => {
  const p = createPlaneProjector("aeqd", ...RCTP);
  for (const dest of [RJTT, KLAX]) {
    const out = { x: 0, y: 0 };
    p.project(...dest, out);
    const { r, az } = polar(out);
    const km = greatCircleKm(...RCTP, ...dest);
    assert.ok(Math.abs(r - (km / EARTH_RADIUS_KM) * PLANE_UNIT) < 1e-9);
    assert.ok(Math.abs(az - bearing(...RCTP, ...dest)) < 1e-6);
  }
  // 桃園→羽田約 2,100 km（合理性檢查，避免單位整個錯掉）
  const km = greatCircleKm(...RCTP, ...RJTT);
  assert.ok(km > 2050 && km < 2200, String(km));
});

test("東西、南北沒有鏡像", () => {
  for (const kind of ["aeqd", "laea", "gnom"]) {
    const p = createPlaneProjector(kind, ...RCTP);
    const e = { x: 0, y: 0 }, n = { x: 0, y: 0 };
    p.project(RCTP[0], RCTP[1] + 5, e);
    p.project(RCTP[0] + 5, RCTP[1], n);
    assert.ok(e.x > 0.5, `${kind} 東邊的點 x 要變大`);
    assert.ok(n.y < 0.5, `${kind} 北邊的點 y 要變小（mercator y 向南）`);
    assert.ok(Math.abs(n.x - 0.5) < 1e-12, `${kind} 正北的點留在中央經線上`);
  }
});

test("三種投影方位角一致，只有半徑不同", () => {
  const km = greatCircleKm(...RCTP, ...RJTT);
  const c = km / EARTH_RADIUS_KM;
  const expectR = { aeqd: c, laea: 2 * Math.sin(c / 2), gnom: Math.tan(c) };
  for (const kind of ["aeqd", "laea", "gnom"]) {
    const out = { x: 0, y: 0 };
    createPlaneProjector(kind, ...RCTP).project(...RJTT, out);
    const { r, az } = polar(out);
    assert.ok(Math.abs(r - expectR[kind] * PLANE_UNIT) < 1e-9, kind);
    assert.ok(Math.abs(az - bearing(...RCTP, ...RJTT)) < 1e-6, kind);
  }
});

test("日晷：任意大圓上的三點共線；超出範圍的點夾在邊緣並回報 false", () => {
  const p = createPlaneProjector("gnom", ...RCTP);
  // 取一條不經過中心的大圓：羽田 → 新加坡，中點用單位向量平均
  const WSSS = [1.3592, 103.9894];
  const uv = ([lat, lng]) => [Math.cos(lat * D2R) * Math.cos(lng * D2R), Math.cos(lat * D2R) * Math.sin(lng * D2R), Math.sin(lat * D2R)];
  const a = uv(RJTT), b = uv(WSSS);
  const m = a.map((v, i) => v + b[i]);
  const len = Math.hypot(...m);
  const mid = [Math.asin(m[2] / len) / D2R, Math.atan2(m[1], m[0]) / D2R];
  const A = { x: 0, y: 0 }, B = { x: 0, y: 0 }, M = { x: 0, y: 0 };
  p.project(...RJTT, A); p.project(...WSSS, B); p.project(...mid, M);
  const cross = (B.x - A.x) * (M.y - A.y) - (B.y - A.y) * (M.x - A.x);
  assert.ok(Math.abs(cross) < 1e-12, String(cross));

  const far = { x: 0, y: 0 };
  assert.equal(p.project(...KLAX, far), false);
  assert.ok(Math.abs(polar(far).r - Math.tan(GNOM_MAX_DEG * D2R) * PLANE_UNIT) < 1e-9);
  assert.ok(Math.abs(polar(far).r - p.rimRadius) < 1e-12);
});

test("整個圓盤落在 mercator 方形內（留邊）", () => {
  for (const kind of ["aeqd", "laea", "gnom"]) {
    const p = createPlaneProjector(kind, ...RCTP);
    assert.ok(p.rimRadius <= 0.18, `${kind} rim=${p.rimRadius}`); // 寬高比 2.5:1 的畫面也放得下
  }
  // 方位等距的對蹠點附近也不會跑出邊界
  const out = { x: 0, y: 0 };
  createPlaneProjector("aeqd", ...RCTP).project(-25.0, -58.7, out);
  assert.ok(out.x > 0.1 && out.x < 0.9 && out.y > 0.1 && out.y < 0.9);
});

test("mercator ↔ 假經緯度互為反函數", () => {
  for (const [x, y] of [[0.5, 0.5], [0.2, 0.8], [0.79, 0.21]]) {
    const [lng, lat] = mercatorToLngLat(x, y);
    const back = lngLatToMercator(lng, lat);
    assert.ok(Math.abs(back.x - x) < 1e-12 && Math.abs(back.y - y) < 1e-12);
  }
  assert.deepEqual(mercatorToLngLat(0.5, 0.5), [0, 0]);
});

test("距離圈：每個點到中心都是指定距離", () => {
  for (const [lng, lat] of rangeRing(...RCTP, 6000, 30)) {
    assert.ok(Math.abs(greatCircleKm(...RCTP, lat, lng) - 6000) < 1e-6);
  }
});

test("projectLine：補點、日晷超出範圍會斷線", () => {
  const aeqd = createPlaneProjector("aeqd", ...RCTP);
  // 桃園→洛杉磯只給兩個端點，補點後應有很多點且全部在同一條放射線上（方位不變）
  const parts = projectLine(aeqd, [[RCTP[1], RCTP[0]], [KLAX[1], KLAX[0]]], 1);
  assert.equal(parts.length, 1);
  assert.ok(parts[0].length > 90);
  const az0 = bearing(...RCTP, ...KLAX);
  for (const [lng, lat] of parts[0].slice(1)) {
    const { az } = polar(lngLatToMercator(lng, lat));
    assert.ok(Math.abs(az - az0) < 1e-6);
  }
  // 日晷：同一條線走到 75° 就被切掉，不會出現沿邊的殘線
  const gnom = createPlaneProjector("gnom", ...RCTP);
  const g = projectLine(gnom, [[RCTP[1], RCTP[0]], [KLAX[1], KLAX[0]]], 1);
  assert.equal(g.length, 1);
  const last = g[0][g[0].length - 1];
  assert.ok(polar(lngLatToMercator(last[0], last[1])).r < gnom.rimRadius);
});

test("展開動畫：t=0 是正射（只有正面半球），t=1 等於目標投影，中間單調變大", () => {
  const c = greatCircleKm(...RCTP, ...RJTT) / EARTH_RADIUS_KM;
  const at = (t) => {
    const p = createPlaneProjector("aeqd", ...RCTP, { from: "ortho", t });
    const out = { x: 0, y: 0 };
    p.project(...RJTT, out);
    return { p, r: polar(out).r, az: polar(out).az };
  };
  const a = at(0), m = at(0.5), b = at(1);
  assert.ok(Math.abs(a.r - Math.sin(c) * PLANE_UNIT) < 1e-9);
  assert.equal(a.p.clipDeg, 90);
  assert.ok(Math.abs(a.p.rimRadius - PLANE_UNIT) < 1e-12); // 正射圓盤半徑 = 1 個球半徑
  assert.ok(Math.abs(b.r - c * PLANE_UNIT) < 1e-9);
  assert.equal(b.p.clipDeg, 180);
  assert.ok(a.r < m.r && m.r < b.r);
  assert.equal(m.p.clipDeg, 135);
  // 方位角全程不變
  assert.ok(Math.abs(a.az - b.az) < 1e-6 && Math.abs(m.az - b.az) < 1e-6);
  // 背面的點在 t=0 被夾在邊緣
  const far = { x: 0, y: 0 };
  assert.equal(a.p.project(...KLAX, far), false);
  assert.ok(Math.abs(polar(far).r - a.p.rimRadius) < 1e-12);
});

test("陸地填色：一般陸塊照原樣；包住對蹠點的陸塊改成「圓盤挖洞」", () => {
  const p = createPlaneProjector("aeqd", ...RCTP);
  const flat = (ring) => ring.flat();
  // rangeRing 繞行方向一致（都繞著自己的圓心順時針）→ 同一種繞行慣例
  const islands = [[10, 100], [40, 140], [-20, 130], [50, 60]].map(([lat, lng]) => [flat(rangeRing(lat, lng, 400, 10))]);
  const antipode = [-RCTP[0], RCTP[1] - 180];
  const capAroundAntipode = [flat(rangeRing(...antipode, 1500, 5))];
  const out = projectPolygons(p, [...islands, capAroundAntipode]);
  assert.equal(out.length, 5);
  for (const poly of out.slice(0, 4)) assert.equal(poly.length, 1);
  const cap = out[4];
  assert.equal(cap.length, 2, "外環＝圓盤邊界，原本的外環變成洞");
  // 第一個環是圓盤邊界：每個點到圓心的距離都是 rimRadius
  for (const [lng, lat] of cap[0]) assert.ok(Math.abs(polar(lngLatToMercator(lng, lat)).r - p.rimRadius) < 1e-9);
  // 洞（原外環）距中心約 20015 − 1500 km 的位置，接近邊緣但在圓盤內
  for (const [lng, lat] of cap[1]) {
    const r = polar(lngLatToMercator(lng, lat)).r;
    assert.ok(r < p.rimRadius && r > p.rimRadius * 0.9);
  }
  // 環都有閉合
  for (const poly of out) for (const ring of poly) assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test("陸地填色（日晷）：整塊在 75° 外的陸塊不畫", () => {
  const p = createPlaneProjector("gnom", ...RCTP);
  const near = [rangeRing(30, 125, 400, 10).flat()];
  const far = [rangeRing(...KLAX, 400, 10).flat()];
  const out = projectPolygons(p, [near, far, [rangeRing(10, 110, 300, 10).flat()]]);
  assert.equal(out.length, 2);
  // 包住對蹠點、又整塊在範圍外的陸塊：夾在邊緣後會繞一整圈（面積不是 0），也不能畫
  const antipode = [-RCTP[0], RCTP[1] - 180];
  const withCap = projectPolygons(p, [near, [rangeRing(10, 110, 300, 10).flat()], [rangeRing(...antipode, 1500, 5).flat()]]);
  assert.equal(withCap.length, 2);
});

test("陸地填色（真實海岸線）：等積投影下不論中心在哪，陸地都佔圓盤約 29%；沒有任何一塊蓋住整個圓盤", () => {
  const land = JSON.parse(readFileSync(new URL("../../../public/basemap/ne_50m_land.json", import.meta.url), "utf8"));
  const area = (ring) => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const A = lngLatToMercator(...ring[i]), B = lngLatToMercator(...ring[i + 1]);
      a += A.x * B.y - B.x * A.y;
    }
    return a / 2;
  };
  // 對蹠點在陸地上（SCEL、WIII）、南半球（YSSY）、高緯（ENGM、PANC）、台灣
  const centers = { RCTP: [25.08, 121.23], SCEL: [-33.39, -70.79], WIII: [-6.13, 106.66], YSSY: [-33.95, 151.18], ENGM: [60.19, 11.1], PANC: [61.17, -150] };
  for (const [name, c] of Object.entries(centers)) {
    for (const kind of ["laea", "aeqd", "gnom"]) {
      const p = createPlaneProjector(kind, ...c);
      const disc = Math.PI * p.rimRadius ** 2;
      let total = 0;
      for (const poly of projectPolygons(p, land.polygons)) {
        const a = poly.map(area);
        const net = Math.abs(a[0]) - a.slice(1).reduce((sum, v) => sum + Math.abs(v), 0);
        assert.ok(net >= 0 && net < 0.6 * disc, `${name} ${kind} 單一陸塊 ${(net / disc).toFixed(2)}`);
        total += net;
      }
      // 等積投影保面積 → 陸地比例就是地球的陸地比例，和中心無關
      if (kind === "laea") assert.ok(Math.abs(total / disc - 0.287) < 0.005, `${name} ${(total / disc).toFixed(3)}`);
      else assert.ok(total / disc > 0.05 && total / disc < 0.6, `${name} ${kind} ${(total / disc).toFixed(3)}`);
    }
  }
});
