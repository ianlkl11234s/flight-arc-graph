import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, LAYOUT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { CloseButton, Eyebrow } from "./PanelHeader";
import { themeVars } from "./vars";

export interface DockKV {
  label: ReactNode;
  /** null / undefined 顯示「—」 */
  value: ReactNode | null | undefined;
}

export interface DockCardProps {
  /** 眉標，例：`FLIGHT · 航班` */
  eyebrow?: string;
  /** 主標（18px），例：航班號 CI0104 */
  title: ReactNode;
  /** 主標右側的次要資訊（mono），例：`RCTP → RJTT` */
  subtitle?: ReactNode;
  /** 鍵值列（dt 左、dd 右，mono） */
  kv?: DockKV[];
  /** 底部動作列（Button 們） */
  actions?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
  width?: number | string;
  style?: CSSProperties;
}

/** 右下 dock 資訊卡外殼：眉標、標題、kv、動作列、關閉（spec §5、R1）。 */
export function DockCard({
  eyebrow,
  title,
  subtitle,
  kv,
  actions,
  onClose,
  closeLabel = "關閉資訊卡",
  children,
  width = LAYOUT.dockWidth,
  style,
}: DockCardProps) {
  const { tokens } = useTheme();
  return (
    <article
      style={{
        ...themeVars(tokens),
        position: "relative",
        width,
        boxSizing: "border-box",
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        WebkitBackdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        padding: `${SPACE.s8 + SPACE.s2}px ${SPACE.s12}px`,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.s11,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s6,
        ...style,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.s8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: SPACE.s8,
              marginTop: eyebrow ? 3 : 0,
            }}
          >
            <span style={{ fontSize: SIZE.s18, fontWeight: 500, lineHeight: 1.2, minWidth: 0 }}>{title}</span>
            {subtitle && (
              <span style={{ fontFamily: FONT.data, fontSize: SIZE.s11, color: tokens.fg2, whiteSpace: "nowrap" }}>{subtitle}</span>
            )}
          </div>
        </div>
        {onClose && (
          <span style={{ marginTop: -SPACE.s4, marginRight: -SPACE.s6 }}>
            <CloseButton onClick={onClose} label={closeLabel} />
          </span>
        )}
      </div>
      {kv && kv.length > 0 && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: `3px ${SPACE.s12}px`,
            fontSize: SIZE.s10,
            margin: 0,
          }}
        >
          {kv.map((row, i) => (
            <div key={i} style={{ display: "contents" }}>
              <dt style={{ color: tokens.fg3 }}>{row.label}</dt>
              <dd
                style={{
                  margin: 0,
                  color: tokens.fg1,
                  fontFamily: FONT.data,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                  minWidth: 0,
                }}
              >
                {row.value === null || row.value === undefined || row.value === "" ? "—" : row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {actions && <div style={{ display: "flex", gap: SPACE.s6, flexWrap: "wrap", marginTop: SPACE.s2 }}>{actions}</div>}
    </article>
  );
}
