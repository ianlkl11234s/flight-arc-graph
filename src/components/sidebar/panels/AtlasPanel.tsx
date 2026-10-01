import { useMemo } from "react";
import type { AirportManifestEntry } from "../../../data/flightLoader";
import type { AtlasColorMode } from "../../../map/atlasGlowLayer";
import type { ThemeColors } from "../theme";
import { SectionHeader, SliderRow } from "../primitives";

/* ── Airspace Panel ─────────────────────────────────────── */

export function AtlasPanel({
  atlasVisible,
  onAtlasVisibleChange,
  atlasEverEnabled,
  atlasGlowVisible,
  onAtlasGlowVisibleChange,
  atlasColorMode,
  onAtlasColorModeChange,
  atlasGlowSize,
  onAtlasGlowSizeChange,
  airportCatalog,
  theme,
}: {
  atlasVisible: boolean;
  onAtlasVisibleChange: (v: boolean) => void;
  atlasEverEnabled: boolean;
  atlasGlowVisible: boolean;
  onAtlasGlowVisibleChange: (v: boolean) => void;
  atlasColorMode: AtlasColorMode;
  onAtlasColorModeChange: (m: AtlasColorMode) => void;
  atlasGlowSize: number;
  onAtlasGlowSizeChange: (v: number) => void;
  airportCatalog: Record<string, AirportManifestEntry>;
  theme: ThemeColors;
}) {
  const stats = useMemo(() => {
    let complete = 0;
    let corePartial = 0;
    let partial = 0;
    for (const e of Object.values(airportCatalog)) {
      if ((e.fullDates?.length ?? 0) > 0) complete++;
      else if (e.isCore) corePartial++;
      else partial++;
    }
    return { complete, corePartial, partial };
  }, [airportCatalog]);

  const legend = [
    { color: "#3FB8A5", opacity: 0.85, label: "完整資料", desc: `整天完整捕捉（${stats.complete}）` },
    { color: "#f1c40f", opacity: 0.7, label: "核心（部分）", desc: `主動抓但未滿整天（${stats.corePartial}）` },
    { color: "#4C84B6", opacity: 0.5, label: "部分（附帶）", desc: `因航線連到而附帶（${stats.partial}）` },
    { color: "#3E434A", opacity: 0.3, label: "僅規劃（未抓）", desc: "前 1000 目標、尚未抓" },
  ];

  return (
    <div>
      <SectionHeader theme={theme}>機場總覽 Atlas</SectionHeader>
      <div style={{ fontSize: 11, color: theme.DIM, lineHeight: 1.6, marginBottom: 10 }}>
        全球機場點位：圓圈大小＝單日流量、顏色＝資料完整度。點圓圈看該機場基本資料。
      </div>

      <button
        onClick={() => onAtlasVisibleChange(!atlasVisible)}
        style={{
          position: "relative",
          width: "100%",
          padding: "8px 12px",
          marginBottom: 14,
          borderRadius: 8,
          cursor: "pointer",
          border: `1px solid ${atlasVisible ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: atlasVisible ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
          color: atlasVisible ? theme.ACTIVE_TEXT : theme.DIM,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        {atlasVisible ? "● 已顯示在地圖上" : "○ 在地圖上顯示機場點"}
        {!atlasEverEnabled && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#ff4444",
              border: `2px solid ${theme.BG_PANEL}`,
              boxShadow: "0 0 6px rgba(255,68,68,0.8)",
              animation: "atlasBadgePulse 1.6s ease-in-out infinite",
              pointerEvents: "none",
            }}
          />
        )}
      </button>

      <div style={{ fontSize: 11, color: theme.DIM, marginBottom: 8, fontWeight: 600 }}>顏色 = 資料完整度</div>
      {legend.map((l) => (
        <div key={l.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, opacity: l.opacity, marginTop: 2, flexShrink: 0, border: `1px solid ${theme.BORDER}` }} />
          <div>
            <div style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 600 }}>{l.label}</div>
            <div style={{ fontSize: 10.5, color: theme.DIM }}>{l.desc}</div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: theme.DIM, marginTop: 12, marginBottom: 6, fontWeight: 600 }}>大小 = 單日流量</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingLeft: 2 }}>
        {[3, 8, 16].map((r, i) => (
          <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <span style={{ width: r * 2, height: r * 2, borderRadius: "50%", background: theme.DIM, opacity: 0.5 }} />
            <span style={{ fontSize: 9, color: theme.DIM }}>{["少", "中", "多"][i]}</span>
          </div>
        ))}
      </div>

      {/* ── 夜空 Bloom 星圖（與上方 circle 點並存的獨立開關）── */}
      <div style={{ borderTop: `1px solid ${theme.BORDER}`, marginTop: 18, paddingTop: 14 }}>
        <div style={{ fontSize: 12.5, color: theme.ACTIVE_TEXT, fontWeight: 700, marginBottom: 4 }}>
          ✦ 夜空 Bloom 星圖
        </div>
        <div style={{ fontSize: 11, color: theme.DIM, lineHeight: 1.6, marginBottom: 10 }}>
          把機場畫成夜空中發光的星點：越大＝流量越高。可與上方圓點並存。
        </div>

        <button
          onClick={() => onAtlasGlowVisibleChange(!atlasGlowVisible)}
          style={{
            width: "100%",
            padding: "8px 12px",
            marginBottom: 12,
            borderRadius: 8,
            cursor: "pointer",
            border: `1px solid ${atlasGlowVisible ? theme.ACTIVE_BORDER : theme.BORDER}`,
            background: atlasGlowVisible ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
            color: atlasGlowVisible ? theme.ACTIVE_TEXT : theme.DIM,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {atlasGlowVisible ? "✦ Bloom 已開啟" : "✧ 開啟 Bloom 星圖"}
        </button>

        {/* 星點大小滑桿 */}
        <div style={{ marginBottom: 12 }}>
          <SliderRow
            label="星點大小"
            value={atlasGlowSize}
            min={0.3}
            max={4}
            step={0.1}
            format={(v) => `${v.toFixed(1)}×`}
            onChange={onAtlasGlowSizeChange}
            theme={theme}
          />
        </div>

        {/* 顏色維度切換 */}
        <div style={{ fontSize: 11, color: theme.DIM, marginBottom: 6, fontWeight: 600 }}>顏色維度</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {([
            { key: "flow", label: "流量 白→橘→紅" },
            { key: "completeness", label: "資料完整度" },
          ] as const).map((opt) => {
            const active = atlasColorMode === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => onAtlasColorModeChange(opt.key)}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 7,
                  cursor: "pointer",
                  border: `1px solid ${active ? theme.ACTIVE_BORDER : theme.BORDER}`,
                  background: active ? theme.ACTIVE_BTN_BG : theme.HOVER_BG,
                  color: active ? theme.ACTIVE_TEXT : theme.DIM,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* 動態圖例 */}
        {atlasColorMode === "flow" ? (
          <div>
            <div
              style={{
                height: 12,
                borderRadius: 6,
                marginBottom: 5,
                background: "linear-gradient(90deg, #ffffff 0%, #ff8c1a 50%, #ff1e1e 100%)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: theme.DIM }}>
              <span>流量低 · 白</span>
              <span>中 · 橘</span>
              <span>樞紐 · 紅</span>
            </div>
          </div>
        ) : (
          legend.map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, opacity: l.opacity, marginTop: 2, flexShrink: 0, border: `1px solid ${theme.BORDER}` }} />
              <div>
                <div style={{ fontSize: 12, color: theme.ACTIVE_TEXT, fontWeight: 600 }}>{l.label}</div>
                <div style={{ fontSize: 10.5, color: theme.DIM }}>{l.desc}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
