import type { ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { themeVars } from "./vars";

export interface StatCardProps {
  label: ReactNode;
  /** null / undefined 顯示「—」（spec R9：缺值不寫 0） */
  value: ReactNode | null | undefined;
  /** 單位或副標，例如「架次」「較前日 +4%」 */
  sub?: ReactNode;
  /** card（預設，格狀卡）／row（標籤左、數字右，取代 StatRow） */
  layout?: "card" | "row";
  /** 數字是否強調為 accent（例如目前時刻）；預設 fg1 */
  emphasis?: boolean;
  title?: string;
}

const MISSING = "—";

/** 統計卡：標籤 / mono tabular 數字 / 副標（spec §5）。 */
export function StatCard({ label, value, sub, layout = "card", emphasis, title }: StatCardProps) {
  const { tokens } = useTheme();
  const shown = value === null || value === undefined || value === "" ? MISSING : value;
  const numStyle = {
    fontFamily: FONT.data,
    fontVariantNumeric: "tabular-nums" as const,
    fontWeight: 500,
    color: emphasis ? tokens.accent : tokens.fg1,
    whiteSpace: "nowrap" as const,
  };

  if (layout === "row") {
    return (
      <div
        title={title}
        style={{
          ...themeVars(tokens),
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: SPACE.s8,
          padding: `${SPACE.s2}px 0`,
          fontFamily: FONT.ui,
        }}
      >
        <span style={{ fontSize: SIZE.s11, color: tokens.fg2, minWidth: 0 }}>{label}</span>
        <span style={{ ...numStyle, fontSize: SIZE.s12 }}>
          {shown}
          {sub && <span style={{ fontSize: SIZE.s10, color: tokens.fg3, marginLeft: SPACE.s4, fontWeight: 400 }}>{sub}</span>}
        </span>
      </div>
    );
  }

  return (
    <div
      title={title}
      style={{
        ...themeVars(tokens),
        padding: `${SPACE.s6}px ${SPACE.s8}px`,
        background: tokens.ctl,
        borderRadius: RADIUS.base,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s2,
        minWidth: 0,
        fontFamily: FONT.ui,
      }}
    >
      <span style={{ fontSize: SIZE.s10, color: tokens.fg3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ ...numStyle, fontSize: SIZE.s14 }}>{shown}</span>
      {sub && <span style={{ fontSize: SIZE.s10, color: tokens.fg2, fontFamily: FONT.data }}>{sub}</span>}
    </div>
  );
}

/** StatCard 等寬格（預設 3 欄）。 */
export function StatGrid({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: SPACE.s6 }}>{children}</div>
  );
}
