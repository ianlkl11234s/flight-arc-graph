/** 單一軌跡點：[緯度, 經度, 高度(公尺), Unix timestamp] */
export type TrailPoint = [number, number, number, number];

/** 航班資料（來自 aviation_data.json） */
export interface Flight {
  fr24_id: string;
  callsign: string;
  registration: string;
  aircraft_type: string;
  origin_icao: string;
  origin_iata: string;
  dest_icao: string;
  dest_iata: string;
  dep_time: number;
  arr_time: number;
  status: string;
  trail_points: number;
  path: TrailPoint[];
  /** IATA 航班號（如 "CX408"，與 ATC callsign 可能不同） */
  flight_number?: string;
  /** 實際營運航空公司 ICAO 三字碼（如 "CAL"） */
  operating_as?: string;
  /** 機身塗裝航空公司 ICAO 三字碼（Codeshare / Wet lease 時與 operating_as 不同） */
  painted_as?: string;
  /** ADS-B 晶片碼（6 位 hex，全球唯一個體 ID） */
  hex?: string;
  /** 實際降落機場 ICAO（轉降 / 緊急降落時 ≠ dest_icao） */
  dest_icao_actual?: string;
  /** ADS-B 首次偵測 Unix timestamp */
  first_seen?: number;
  /** ADS-B 最後偵測 Unix timestamp */
  last_seen?: number;
}

/** 機場預設視角 */
export interface CameraPreset {
  name: string;
  icao: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/** 多機場組合（saved set），用於組合檢視模式 */
export interface SavedAirportSet {
  id: string;
  name: string;
  shortName: string;
  icaos: string[];
}

/** 時間軸狀態 */
export interface TimelineState {
  playing: boolean;
  currentTime: number;
  startTime: number;
  endTime: number;
  speed: number;
}

/** 資料來源 */
export type DataSource = "api" | "fused";

/** 地理範圍 */
export type Scope = "airport" | "region";

/** 區域 */
export type Region = "TW" | "JP" | "HK" | "KR" | "TH" | "US" | "UK" | "world" | "all";

/** 軌跡模式：stack 顯示全部航班、single 追蹤單一航班 */
export type TrackMode = "stack" | "single";

/** 渲染模式：3D（Three.js 含高度）或 2D（Mapbox 原生平面） */
export type RenderMode = "3d" | "2d";

/** 顯示模式：trails 顯示完整軌跡、status 只顯示飛機位置 */
export type DisplayMode = "trails" | "status";

/** 軌跡顯示：full 全部顯示、progressive 飛過才顯示 */
export type TrailDisplay = "full" | "progressive";

/** Mapbox 底圖樣式 */
export interface MapStyle {
  id: string;
  name: string;
  url: string;
}

/** 統計面板 Tab */
export type StatsTab = "airport" | "region";

/** Drill-down 狀態 */
export interface StatsDrillDown {
  type: "country" | "airport" | "route" | "all-routes" | "all-destinations" | "all-aircraft";
  /** 國家/地區名稱 or ICAO */
  key: string;
  label: string;
}

/** 每日統計 */
export interface DailyStat {
  date: string;
  departures: number;
  arrivals: number;
  total: number;
}

/** 每小時統計 */
export interface HourlyStat {
  hour: number;
  count: number;
}

/** 目的地統計 */
export interface DestinationStat {
  icao: string;
  iata: string;
  count: number;
}

/** 國家分組 */
export interface CountryGroup {
  country: string;
  airports: DestinationStat[];
  totalFlights: number;
}

/** 機場比較 */
export interface AirportComparison {
  icao: string;
  iata: string;
  name: string;
  count: number;
}

/** 機型統計 */
export interface AircraftTypeStat {
  type: string;
  count: number;
}

/** 航空公司統計 */
export interface AirlineStat {
  code: string;
  count: number;
}

/** 飛行時間分佈 */
export interface DurationBucket {
  label: string;
  tag: string;
  min: number;
  max: number;
  count: number;
}

/** 國內航線 */
export interface DomesticRoute {
  from: string;
  to: string;
  fromIata: string;
  toIata: string;
  count: number;
}
