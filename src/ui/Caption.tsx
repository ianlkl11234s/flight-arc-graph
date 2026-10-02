import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, SIZE, SPACE } from "../styles/tokens";
import { CloseButton } from "./PanelHeader";
import { themeVars } from "./vars";

export interface CaptionMetaItem {
  /** 前綴文字（fg2），例：「進場」 */
  label?: ReactNode;
  /** 強調數值（fg1），例：303 */
  value?: ReactNode;
  /** 數值後的單位（fg2），例：「班」 */
  unit?: ReactNode;
}

export interface CaptionProps {
  /** 機場碼／組合名（30px mono） */
  code: ReactNode;
  /** 中文名（次要） */
  name?: ReactNode;
  /** 第二行：日期 · 總班數 · 進場 · 離場…（mono） */
  meta?: CaptionMetaItem[];
  /** 第三行提示（例：此日期範圍無航班資料） */
  notice?: ReactNode;
  /** 有傳時在標題旁放 SVG 退出鈕（組合模式「退出組合」） */
  onExit?: () => void;
  exitLabel?: string;
  /** 圖說下方的小入口（例：Q6 引導「選機場」「全部機場」） */
  actions?: ReactNode;
  style?: CSSProperties;
}

/** 左下圖說：在看什麼。左側 2px 琥珀直線、機場碼 30px mono（spec §3、§4）。 */
export function Caption({ code, name, meta, notice, onExit, exitLabel = "退出", actions, style }: CaptionProps) {
  const { tokens } = useTheme();
  return (
    <div
      style={{
        ...themeVars(tokens),
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s4 + 1,
        borderLeft: `2px solid ${tokens.accent}`,
        paddingLeft: SPACE.s12,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        pointerEvents: "none",
        minWidth: 0,
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.s12, minWidth: 0 }}>
        <span
          style={{
            fontFamily: FONT.data,
            fontSize: SIZE.s30,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: ".04em",
            whiteSpace: "nowrap",
          }}
        >
          {code}
        </span>
        {name != null && name !== "" && (
          <span style={{ fontSize: SIZE.s12, color: tokens.fg2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </span>
        )}
        {onExit && (
          <span style={{ pointerEvents: "auto", alignSelf: "center" }}>
            <CloseButton onClick={onExit} label={exitLabel} />
          </span>
        )}
      </div>
      {meta && meta.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `${SPACE.s2}px ${SPACE.s12}px`,
            fontFamily: FONT.data,
            fontSize: SIZE.s10,
            color: tokens.fg2,
            letterSpacing: ".03em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {meta.map((m, i) => (
            <span key={i} style={{ whiteSpace: "nowrap" }}>
              {m.label}
              {m.label != null && m.value != null ? " " : null}
              {m.value != null && <b style={{ color: tokens.fg1, fontWeight: 500 }}>{m.value}</b>}
              {m.unit != null ? <> {m.unit}</> : null}
            </span>
          ))}
        </div>
      )}
      {notice && <div style={{ fontSize: SIZE.s10, color: tokens.fg2 }}>{notice}</div>}
      {actions && (
        <div style={{ display: "flex", gap: SPACE.s6, marginTop: SPACE.s4, pointerEvents: "auto" }}>{actions}</div>
      )}
    </div>
  );
}
