import type { DataSource, Region, Scope } from "../../types";
import type { AircraftFilterKey } from "../../data/aircraftCategories";

export interface ScenePreset {
  id: string;
  name: string;
  desc: string;
  camera: { center: [number, number]; zoom: number; pitch: number; bearing: number };
  dataSource: DataSource;
  scope: Scope;
  rangeDays: number;
  /** 起始日期 YYYY-MM-DD */
  date: string;
  /** 該日期內的 seek 時間 "HH:MM" (台灣時間) */
  time: string;
  opacity?: number;
  /** 航線軌跡 airport scope 時要選的機場 */
  airport?: string;
  /** 機型篩選 */
  aircraftFilter?: AircraftFilterKey;
  /** 場景所屬 region（用於篩選顯示） */
  region?: Region;
}

export const SCENE_PRESETS: ScenePreset[] = [
  // Taiwan
  {
    id: "tw-air-corridor",
    name: "台灣空中走廊",
    desc: "空域快照 · All TW · 1d",
    camera: { center: [121.0116, 24.5589], zoom: 9, pitch: 69, bearing: 69 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "02:18",
    opacity: 0.04,
    region: "TW",
  },
  {
    id: "china-active",
    name: "活躍中國境內班機",
    desc: "空域快照 · All TW · 1d",
    camera: { center: [118.286, 25.68], zoom: 8.2, pitch: 56, bearing: 23 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "08:17",
    opacity: 0.04,
    region: "TW",
  },
  {
    id: "taoyuan-closeup",
    name: "桃園機場起降",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [121.23, 25.08], zoom: 10.8, pitch: 65, bearing: 30 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-19",
    time: "07:52",
    opacity: 0.1,
    airport: "RCTP",
    region: "TW",
  },
  {
    id: "all-taiwan-overview",
    name: "全台航線總覽",
    desc: "航線軌跡 · All TW · 1d",
    camera: { center: [120.6818, 23.4015], zoom: 7.5, pitch: 50, bearing: 0 },
    dataSource: "api",
    scope: "region",
    rangeDays: 1,
    date: "2026-02-19",
    time: "11:16",
    opacity: 0.06,
    region: "TW",
  },
  {
    id: "p8-patrol",
    name: "P-8 反潛機巡邏路徑",
    desc: "空域快照 · Military · 1d",
    camera: { center: [120.8183, 22.5421], zoom: 7, pitch: 28, bearing: -10 },
    dataSource: "fused",
    scope: "region",
    rangeDays: 1,
    date: "2026-03-06",
    time: "12:27",
    opacity: 0.36,
    aircraftFilter: "cat:military",
    region: "TW",
  },
  // Japan
  {
    id: "komaki-c130",
    name: "小牧基地 C-130",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [137.1058, 35.0844], zoom: 10, pitch: 55, bearing: 0 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-18",
    time: "08:10",
    opacity: 0.1,
    airport: "RJNA",
    region: "JP",
  },
  {
    id: "tokyo-heli",
    name: "東京觀光直升機",
    desc: "航線軌跡 · This Airport · 1d",
    camera: { center: [139.7432, 35.632], zoom: 12.3, pitch: 38, bearing: 128 },
    dataSource: "api",
    scope: "airport",
    rangeDays: 1,
    date: "2026-02-18",
    time: "08:34",
    opacity: 0.1,
    airport: "RJTT",
    region: "JP",
  },
];
