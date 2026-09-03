import type { TrailPoint } from "./index";

/**
 * Flight.path 的 SoA typed array 包裝，取代 `TrailPoint[]`（[lat, lng, alt, t] tuple 陣列）。
 *
 * - lat/lng 用 Float64Array：不能用 Float32，Float32 對經緯度的誤差約 1e-5 度 ≈ 1 公尺，
 *   z12 以上看得出來 —「呈現不能錯」優先於再省 8 B。
 * - alt 用 Float32Array：公尺，量級 0–13000，精度綽綽有餘。
 * - t 用 Uint32Array：unix 秒最大 4.29e9，目前 1.77e9，夠用。
 *
 * = 24 B/點，取代原本 tuple array 的 ~60 B/點（V8 下每點一個 JSArray + FixedDoubleArray）。
 *
 * 熱路徑（每幀執行：FlightScene.ts 建構迴圈、customLayer.ts、staticTrails.ts）一律用
 * lat(i)/lng(i)/alt(i)/t(i) 逐欄存取；at(i) 每次呼叫會配置一個新 tuple，只給冷路徑
 * （統計／載入）少數真的需要 tuple 的呼叫點用，熱路徑不要用。
 */
export class TrackPath {
  private readonly _lat: Float64Array;
  private readonly _lng: Float64Array;
  private readonly _alt: Float32Array;
  private readonly _t: Uint32Array;

  constructor(lat: Float64Array, lng: Float64Array, alt: Float32Array, t: Uint32Array) {
    this._lat = lat;
    this._lng = lng;
    this._alt = alt;
    this._t = t;
  }

  get length(): number {
    return this._lat.length;
  }

  lat(i: number): number {
    return this._lat[i]!;
  }

  lng(i: number): number {
    return this._lng[i]!;
  }

  alt(i: number): number {
    return this._alt[i]!;
  }

  t(i: number): number {
    return this._t[i]!;
  }

  /** 回傳 [lat, lng, alt, t]；只給少數真的需要 tuple 的呼叫點用，熱路徑不要用（會配置物件） */
  at(i: number): TrailPoint {
    return [this._lat[i]!, this._lng[i]!, this._alt[i]!, this._t[i]!];
  }

  static fromArray(points: readonly TrailPoint[]): TrackPath {
    const n = points.length;
    const lat = new Float64Array(n);
    const lng = new Float64Array(n);
    const alt = new Float32Array(n);
    const t = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      const p = points[i]!;
      lat[i] = p[0];
      lng[i] = p[1];
      alt[i] = p[2];
      t[i] = p[3];
    }
    return new TrackPath(lat, lng, alt, t);
  }
}
