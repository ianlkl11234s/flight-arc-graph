export const RAIL_WIDTH = 56;
export const PANEL_WIDTH = 300;

export interface ThemeColors {
  ACCENT: string;
  BG_RAIL: string;
  BG_PANEL: string;
  BORDER: string;
  DIM: string;
  ACTIVE_TEXT: string;
  ACTIVE_BG: string;
  ACTIVE_BORDER: string;
  ACTIVE_BTN_BG: string;
  HOVER_BG: string;
  SLIDER_TRACK: string;
  ACCENT_BLUE: string;
  SCENE_BAR: string;
  CLOSE_BG: string;
  CLOSE_BORDER: string;
  DISABLED_TEXT: string;
  NO_DATA_TEXT: string;
  SELECT_BG: string;
}

export function getThemeColors(isDark: boolean): ThemeColors {
  if (isDark) {
    return {
      ACCENT: "#E5E7EB",
      BG_RAIL: "#0D0E10",
      BG_PANEL: "rgba(0, 0, 0, 0.45)",
      BORDER: "#2A2D32",
      DIM: "#6B7280",
      ACTIVE_TEXT: "#fff",
      ACTIVE_BG: "rgba(100,170,255,0.2)",
      ACTIVE_BORDER: "#64aaff",
      ACTIVE_BTN_BG: "rgba(100,170,255,0.15)",
      HOVER_BG: "rgba(255,255,255,0.05)",
      SLIDER_TRACK: "#333",
      ACCENT_BLUE: "#64aaff",
      SCENE_BAR: "#f59e0b",
      CLOSE_BG: "rgba(255,255,255,0.06)",
      CLOSE_BORDER: "rgba(255,255,255,0.1)",
      DISABLED_TEXT: "#444",
      NO_DATA_TEXT: "#444",
      SELECT_BG: "rgba(0,0,0,0.4)",
    };
  }
  return {
    ACCENT: "#333333",
    BG_RAIL: "#F8F9FA",
    BG_PANEL: "rgba(255, 255, 255, 0.85)",
    BORDER: "#E0E0E0",
    DIM: "#888888",
    ACTIVE_TEXT: "#1a1a1a",
    ACTIVE_BG: "rgba(59, 130, 246, 0.15)",
    ACTIVE_BORDER: "#3B82F6",
    ACTIVE_BTN_BG: "rgba(59, 130, 246, 0.1)",
    HOVER_BG: "rgba(0,0,0,0.04)",
    SLIDER_TRACK: "#d1d5db",
    ACCENT_BLUE: "#3B82F6",
    SCENE_BAR: "#E8A308",
    CLOSE_BG: "rgba(0,0,0,0.06)",
    CLOSE_BORDER: "rgba(0,0,0,0.1)",
    DISABLED_TEXT: "#bbb",
    NO_DATA_TEXT: "#ccc",
    SELECT_BG: "rgba(0,0,0,0.06)",
  };
}
