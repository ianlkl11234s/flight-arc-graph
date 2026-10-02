import type { ReactNode } from "react";
import { ThemeProvider, useTheme } from "../styles/ThemeContext";
import { COLOR, FONT, SIZE, SPACE } from "../styles/tokens";

/** 底圖色塊 + 該主題的 ThemeProvider；data-theme 也寫在容器上，tokens.css 變數就近生效。 */
function Surface({ children }: { children: ReactNode }) {
  const { tokens, isDark } = useTheme();
  return (
    <div
      data-theme={isDark ? "dark" : "light"}
      style={{
        background: tokens.mapBg,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.s11,
        padding: SPACE.s24,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: SPACE.s16,
        alignItems: "flex-start",
      }}
    >
      <span style={{ fontFamily: FONT.data, fontSize: SIZE.s9, letterSpacing: ".18em", color: tokens.fg3 }}>
        {isDark ? "DARK · 暗" : "LIGHT · 淡"}
      </span>
      {children}
    </div>
  );
}

/** 一個元件一段：標題 + 說明 + 暗／淡並排（各自一個 ThemeProvider，同一個 render 函式跑兩次）。 */
export function Showcase({
  id,
  name,
  note,
  render,
}: {
  id: string;
  name: string;
  note: string;
  render: () => ReactNode;
}) {
  const t = COLOR.dark;
  return (
    <section id={id} style={{ marginBottom: SPACE.s24 * 2 }}>
      <h2 style={{ fontFamily: FONT.data, fontSize: SIZE.s14, fontWeight: 500, color: t.fg1, margin: `0 0 ${SPACE.s4}px` }}>{name}</h2>
      <p style={{ fontSize: SIZE.s11, color: t.fg2, margin: `0 0 ${SPACE.s12}px`, maxWidth: 820, lineHeight: 1.6 }}>{note}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", border: `1px solid ${t.border}` }}>
        <ThemeProvider isDark>
          <Surface>{render()}</Surface>
        </ThemeProvider>
        <ThemeProvider isDark={false}>
          <Surface>{render()}</Surface>
        </ThemeProvider>
      </div>
    </section>
  );
}
