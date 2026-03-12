/**
 * Web Worker：預計算所有軌跡點的 Mercator 座標
 * 將 [lat, lng, alt, ts] 轉為 [mx, my, baseZ, ts]
 * baseZ 是 altExaggeration=1, altOffset=0 的基準值
 */

// 純計算函數（不依賴 mapboxgl，因為 Worker 無法載入 DOM 依賴）
// 使用數學公式直接計算 Mercator 座標

function lngToMercatorX(lng: number): number {
  return (lng + 180) / 360;
}

function latToMercatorY(lat: number): number {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  return (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2;
}

function altToMercatorZ(lat: number, altMeters: number): number {
  // Mapbox MercatorCoordinate 的 z 軸：1 unit = circumference of earth
  // meterInMercatorCoordinateUnits = 1 / (earthCircumference * cos(lat))
  const earthCircumference = 40075016.686;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const meterScale = 1 / (earthCircumference * cosLat);
  // 注意：Mapbox z 軸向下為正，高度應為負值
  return -altMeters * meterScale;
}

interface TransformMessage {
  type: "transform";
  /** 所有航班的 path 陣列 */
  paths: Array<{
    fr24_id: string;
    path: [number, number, number, number][];
  }>;
}

interface TransformResult {
  type: "result";
  /** 預計算後的 Mercator 座標 */
  data: Array<{
    fr24_id: string;
    /** [mx, my, baseZ, ts] per point */
    mercatorPath: [number, number, number, number][];
  }>;
}

self.onmessage = (e: MessageEvent<TransformMessage>) => {
  if (e.data.type !== "transform") return;

  const results: TransformResult["data"] = [];

  for (const flight of e.data.paths) {
    const mercatorPath: [number, number, number, number][] = [];

    for (const pt of flight.path) {
      const [lat, lng, alt, ts] = pt;
      const mx = lngToMercatorX(lng);
      const my = latToMercatorY(lat);
      const baseZ = altToMercatorZ(lat, alt);
      mercatorPath.push([mx, my, baseZ, ts]);
    }

    results.push({ fr24_id: flight.fr24_id, mercatorPath });
  }

  const result: TransformResult = { type: "result", data: results };
  self.postMessage(result);
};
