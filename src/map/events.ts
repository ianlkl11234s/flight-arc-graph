import type { Region } from "../types";

/**
 * 精選事件（rail「事件」面板）。點卡片 = 切到 region 範圍、跳到事件首日、天數 = days。
 * 數字是手動同步的：daily 取本機 per-airport daily shard，台北日期（起飛時間）切日、
 * 依 fr24_id 去重；資料重抓後要重算。
 */
export interface EventPreset {
  id: string;
  name: string;
  region: Region;
  /** 範圍說明（顯示用） */
  scopeLabel: string;
  /** 首日 YYYY-MM-DD（台灣時間） */
  start: string;
  days: number;
  /** 每日軌跡數（台北日期），長度 = days */
  daily: number[];
  quote: string;
  /** 長文網址（/notes/<slug>/）；沒有長文時省略 */
  noteHref?: string;
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: "typhoon-bavi-2026-07",
    name: "巴威颱風",
    region: "TW",
    scopeLabel: "台灣 22 座機場",
    start: "2026-07-09",
    days: 4,
    daily: [1201, 730, 85, 1087],
    quote: "7/11 桃機 760 架次全數取消，史上首見的空白日",
    noteHref: "/notes/typhoon-bavi-2026-07/",
  },
  {
    id: "typhoon-champi-2026-10",
    name: "薔琵颱風",
    region: "TW",
    scopeLabel: "台灣 22 座機場",
    start: "2026-10-22",
    days: 4,
    daily: [1029, 249, 852, 1259],
    quote: "10/23 桃機取消 563 架次，當日起降剩約兩成",
  },
];

/** 事件第 i 天的日期 YYYY-MM-DD */
export function eventDate(ev: EventPreset, i: number): string {
  const t = Date.parse(`${ev.start}T00:00:00Z`) + i * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 事件最後一天 YYYY-MM-DD */
export function eventEndDate(ev: EventPreset): string {
  return eventDate(ev, ev.days - 1);
}

/** 軌跡總數（各日加總） */
export function eventTotal(ev: EventPreset): number {
  return ev.daily.reduce((a, b) => a + b, 0);
}
