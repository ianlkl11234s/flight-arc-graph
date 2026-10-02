import { useMemo } from "react";
import type { AirportManifestEntry } from "../../../data/flightLoader";
import type { AtlasColorMode } from "../../../map/atlasGlowLayer";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Button, Section, Segmented, Slider } from "../../../ui";
import { mix } from "../../../ui/vars";

/* ── Atlas Panel ─────────────────────────────────────── */

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

  const { tokens } = useTheme();
  const note = { fontSize: SIZE.body, color: tokens.fg2, lineHeight: 1.6, fontFamily: FONT.ui } as const;
  const legendRows = legend.map((l) => (
    <div key={l.label} style={{ display: "flex", alignItems: "flex-start", gap: SPACE.s8 }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, opacity: l.opacity, marginTop: 2, flexShrink: 0, border: `1px solid ${tokens.border}` }} />
      <div>
        <div style={{ fontSize: SIZE.body, color: tokens.fg1, fontWeight: 500 }}>{l.label}</div>
        <div style={{ fontSize: SIZE.minor, color: tokens.fg3 }}>{l.desc}</div>
      </div>
    </div>
  ));

  return (
    <>
      <Section title="ATLAS · 機場總覽">
        <div style={note}>
          全球機場點位：圓圈大小＝單日流量、顏色＝資料完整度。點圓圈看該機場基本資料。
        </div>
        <Button
          fullWidth
          pressed={atlasVisible}
          onClick={() => onAtlasVisibleChange(!atlasVisible)}
          style={{ position: "relative" }}
        >
          {atlasVisible ? "已顯示在地圖上" : "在地圖上顯示機場點"}
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
                background: tokens.rec,
                border: `2px solid ${tokens.mapBg}`,
                boxShadow: `0 0 6px ${mix(tokens.rec, 80)}`,
                animation: "atlasBadgePulse 1.6s ease-in-out infinite",
                pointerEvents: "none",
              }}
            />
          )}
        </Button>
      </Section>

      <Section title="COLOR · 顏色 = 資料完整度">{legendRows}</Section>

      <Section title="SIZE · 大小 = 單日流量">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, paddingLeft: 2 }}>
          {[3, 8, 16].map((r, i) => (
            <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.s4 }}>
              <span style={{ width: r * 2, height: r * 2, borderRadius: "50%", background: tokens.fg3, opacity: 0.5 }} />
              <span style={{ fontSize: SIZE.eyebrow, color: tokens.fg3 }}>{["少", "中", "多"][i]}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 夜空 Bloom 星圖（與上方 circle 點並存的獨立開關）── */}
      <Section title="BLOOM · 夜空星圖">
        <div style={note}>
          把機場畫成夜空中發光的星點：越大＝流量越高。可與上方圓點並存。
        </div>
        <Button fullWidth pressed={atlasGlowVisible} onClick={() => onAtlasGlowVisibleChange(!atlasGlowVisible)}>
          {atlasGlowVisible ? "Bloom 已開啟" : "開啟 Bloom 星圖"}
        </Button>

        {/* 星點大小滑桿 */}
        <Slider
          label="星點大小"
          value={atlasGlowSize}
          min={0.3}
          max={4}
          step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={onAtlasGlowSizeChange}
        />

        {/* 顏色維度切換 */}
        <div style={{ fontSize: SIZE.body, color: tokens.fg2 }}>顏色維度</div>
        <Segmented<AtlasColorMode>
          fullWidth
          options={[
            { value: "flow", label: "流量 白→橘→紅" },
            { value: "completeness", label: "資料完整度" },
          ]}
          value={atlasColorMode}
          onChange={onAtlasColorModeChange}
        />

        {/* 動態圖例 */}
        {atlasColorMode === "flow" ? (
          <div>
            <div
              style={{
                height: 12,
                borderRadius: RADIUS.base,
                marginBottom: 5,
                background: "linear-gradient(90deg, #ffffff 0%, #ff8c1a 50%, #ff1e1e 100%)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: SIZE.minor, color: tokens.fg3 }}>
              <span>流量低 · 白</span>
              <span>中 · 橘</span>
              <span>樞紐 · 紅</span>
            </div>
          </div>
        ) : (
          legendRows
        )}
      </Section>
    </>
  );
}
