import { AIRSPACE_CATEGORIES, type AirspaceCategory, type AirspaceSettings } from "../../../types/airspace";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import { SectionHeader, SliderRow } from "../primitives";

export function AirspacePanel({
  settings,
  onChange,
  theme,
}: {
  settings: AirspaceSettings;
  onChange: (s: AirspaceSettings) => void;
  theme: ThemeColors;
}) {
  const update = (patch: Partial<AirspaceSettings>) => onChange({ ...settings, ...patch });
  const toggleCategory = (cat: AirspaceCategory) => {
    onChange({
      ...settings,
      visibility: { ...settings.visibility, [cat]: !settings.visibility[cat] },
    });
  };

  // 分類色點（依主題）
  const getSwatchColor = (cat: AirspaceCategory) => {
    const conf = AIRSPACE_CATEGORIES.find((c) => c.id === cat)!;
    const rgb = conf.colorDark;
    return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`;
  };

  return (
    <>
      <SectionHeader theme={theme}>Airspace</SectionHeader>

      {/* 總開關 */}
      <div
        onClick={() => update({ enabled: !settings.enabled })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 10px",
          marginBottom: 8,
          borderRadius: 6,
          border: `1px solid ${settings.enabled ? theme.ACTIVE_BORDER : theme.BORDER}`,
          background: settings.enabled ? theme.ACTIVE_BG : "transparent",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
      >
        <span style={{ fontSize: 12, fontFamily: FONT.ui, color: theme.ACCENT }}>
          Show Airspace
        </span>
        <span
          style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            background: settings.enabled ? theme.ACCENT_BLUE : theme.SLIDER_TRACK,
            position: "relative",
            transition: "background 0.15s",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 1,
              left: settings.enabled ? 15 : 1,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.15s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
            }}
          />
        </span>
      </div>

      {/* 分類 */}
      <SectionHeader theme={theme}>Layers</SectionHeader>
      {AIRSPACE_CATEGORIES.map((conf) => {
        const isOn = settings.visibility[conf.id];
        return (
          <div
            key={conf.id}
            onClick={() => toggleCategory(conf.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              marginBottom: 4,
              borderRadius: 4,
              cursor: settings.enabled ? "pointer" : "not-allowed",
              opacity: settings.enabled ? 1 : 0.4,
              background: isOn ? theme.HOVER_BG : "transparent",
              border: `1px solid ${isOn ? theme.BORDER : "transparent"}`,
              transition: "background 0.15s",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: getSwatchColor(conf.id),
                boxShadow: isOn ? `0 0 6px ${getSwatchColor(conf.id)}` : "none",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 11,
                fontFamily: FONT.ui,
                color: isOn ? theme.ACTIVE_TEXT : theme.DIM,
              }}
            >
              {conf.label}
            </span>
            <span style={{ fontSize: 10, color: theme.DIM }}>{isOn ? "●" : "○"}</span>
          </div>
        );
      })}

      {/* Overlays */}
      <SectionHeader theme={theme}>Overlays</SectionHeader>
      <div
        onClick={() => settings.enabled && update({ showMedianLine: !settings.showMedianLine })}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
          marginBottom: 8,
          borderRadius: 4,
          cursor: settings.enabled ? "pointer" : "not-allowed",
          opacity: settings.enabled ? 1 : 0.4,
          background: settings.showMedianLine ? theme.HOVER_BG : "transparent",
          border: `1px solid ${settings.showMedianLine ? theme.BORDER : "transparent"}`,
          transition: "background 0.15s",
        }}
      >
        <span
          style={{
            width: 18,
            height: 2,
            background: settings.showMedianLine ? "#ffffff" : theme.DIM,
            boxShadow: settings.showMedianLine ? "0 0 6px rgba(255,255,255,0.6)" : "none",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: FONT.ui,
            color: settings.showMedianLine ? theme.ACTIVE_TEXT : theme.DIM,
          }}
        >
          海峽中線 Median Line
        </span>
        <span style={{ fontSize: 10, color: theme.DIM }}>{settings.showMedianLine ? "●" : "○"}</span>
      </div>

      {/* Style */}
      <SectionHeader theme={theme}>Style</SectionHeader>
      <SliderRow
        label="Opacity"
        value={settings.opacity}
        min={0}
        max={1}
        step={0.01}
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ opacity: v })}
        theme={theme}
      />
      <SliderRow
        label="Height Scale"
        value={settings.heightScale}
        min={0.5}
        max={5}
        step={0.1}
        format={(v) => `${v.toFixed(1)}×`}
        onChange={(v) => update({ heightScale: v })}
        theme={theme}
      />
      <SliderRow
        label="Edge Glow"
        value={settings.edgeGlow}
        min={0}
        max={2}
        step={0.05}
        format={(v) => v.toFixed(2)}
        onChange={(v) => update({ edgeGlow: v })}
        theme={theme}
      />
    </>
  );
}
