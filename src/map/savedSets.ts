import type { SavedAirportSet } from "../types";

/**
 * Tier 1 hardcoded saved sets。
 * Tier 2 會加 localStorage 儲存使用者自訂組合（屆時 BUILTIN_SETS 變預設值）。
 */
export const BUILTIN_SETS: SavedAirportSet[] = [
  {
    id: "eu-lhr",
    name: "EU + LHR 紐帶",
    shortName: "EU + LHR",
    icaos: ["EGLL", "LFPG", "EHAM", "EDDF", "EDDM", "LEMD", "LTFM"],
  },
  {
    id: "tw-intl",
    name: "TW 國際",
    shortName: "TW Intl",
    icaos: ["RCTP", "RCKH", "RCMQ"],
  },
  {
    id: "apac-hub",
    name: "亞太樞紐",
    shortName: "APAC Hubs",
    icaos: ["RCTP", "RJTT", "RJAA", "VHHH", "ROAH", "RJBB"],
  },
  {
    id: "transatlantic",
    name: "跨大西洋",
    shortName: "Transatlantic",
    icaos: ["KJFK", "KEWR", "EGLL", "LFPG"],
  },
  {
    id: "london-cluster",
    name: "倫敦群",
    shortName: "London 5",
    icaos: ["EGLL", "EGKK", "EGLC", "EGSS", "EGGW"],
  },
];

export function getSavedSetById(id: string): SavedAirportSet | undefined {
  return BUILTIN_SETS.find((s) => s.id === id);
}
