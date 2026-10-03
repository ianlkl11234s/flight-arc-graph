import type { ReactNode } from "react";
import { AIRSPACE_CATEGORIES, type AirspaceCategory, type AirspaceSettings } from "../../../types/airspace";
import { MEDIAN_LINE_COLOR, rgbCss } from "../../../types/dataColors";
import { useTheme } from "../../../styles/ThemeContext";
import { SPACE } from "../../../styles/tokens";
import { Section, Slider, Toggle } from "../../../ui";

export function AirspacePanel({
  settings,
  onChange,
}: {
  settings: AirspaceSettings;
  onChange: (s: AirspaceSettings) => void;
}) {
  const { tokens } = useTheme();
  const update = (patch: Partial<AirspaceSettings>) => onChange({ ...settings, ...patch });
  const toggleCategory = (cat: AirspaceCategory) => {
    onChange({
      ...settings,
      visibility: { ...settings.visibility, [cat]: !settings.visibility[cat] },
    });
  };

  // 分類色點（資料色，依空域類別）
  const getSwatchColor = (cat: AirspaceCategory) => {
    const conf = AIRSPACE_CATEGORIES.find((c) => c.id === cat)!;
    const rgb = conf.colorDark;
    return rgbCss(rgb);
  };

  const swatchLabel = (swatch: ReactNode, text: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {swatch}
      {text}
    </span>
  );

  return (
    <>
      <Section title="AIRSPACE · 空域">
        {/* 總開關 */}
        <Toggle label="Show Airspace" checked={settings.enabled} onChange={(v) => update({ enabled: v })} />
      </Section>

      {/* 分類／疊加：總開關關閉時變暗但仍可點（預先設定，開總開關後生效） */}
      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, opacity: settings.enabled ? 1 : 0.45, transition: "opacity .15s" }}>
        <Section title="LAYERS · 分類">
          {AIRSPACE_CATEGORIES.map((conf) => {
            const isOn = settings.visibility[conf.id];
            const color = getSwatchColor(conf.id);
            return (
              <Toggle
                key={conf.id}
                checked={isOn}
                onChange={() => toggleCategory(conf.id)}
                label={swatchLabel(
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: color,
                      boxShadow: isOn ? `0 0 6px ${color}` : "none",
                      flexShrink: 0,
                    }}
                  />,
                  conf.label,
                )}
              />
            );
          })}
        </Section>

        {/* Overlays */}
        <Section title="OVERLAYS · 疊加">
          <Toggle
            checked={settings.showMedianLine}
            onChange={(v) => update({ showMedianLine: v })}
            label={swatchLabel(
              <span
                style={{
                  width: 18,
                  height: 2,
                  background: settings.showMedianLine ? MEDIAN_LINE_COLOR : tokens.fg3,
                  flexShrink: 0,
                }}
              />,
              "海峽中線 Median Line",
            )}
          />
        </Section>
      </div>

      {/* Style */}
      <Section title="STYLE · 樣式">
        <Slider
          label="Opacity"
          value={settings.opacity}
          min={0}
          max={1}
          step={0.01}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update({ opacity: v })}
        />
        <Slider
          label="Height Scale"
          value={settings.heightScale}
          min={0.5}
          max={5}
          step={0.1}
          format={(v) => `${v.toFixed(1)}×`}
          onChange={(v) => update({ heightScale: v })}
        />
        <Slider
          label="Edge Glow"
          value={settings.edgeGlow}
          min={0}
          max={2}
          step={0.05}
          format={(v) => v.toFixed(2)}
          onChange={(v) => update({ edgeGlow: v })}
        />
      </Section>
    </>
  );
}
