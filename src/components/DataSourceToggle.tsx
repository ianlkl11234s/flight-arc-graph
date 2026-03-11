import type { DataSource } from "../types";

interface DataSourceToggleProps {
  dataSource: DataSource;
  hasFused: boolean;
  isDarkTheme: boolean;
  onChange: (source: DataSource) => void;
}

const options: { value: DataSource; label: string }[] = [
  { value: "api", label: "Route Tracks" },
  { value: "fused", label: "Airspace Scan" },
];

export function DataSourceToggle({
  dataSource,
  hasFused,
  isDarkTheme,
  onChange,
}: DataSourceToggleProps) {
  return (
    <>
      {options.map(({ value, label }) => {
        const active = dataSource === value;
        const disabled = value === "fused" && !hasFused;
        return (
          <button
            key={value}
            disabled={disabled}
            onClick={() => onChange(value)}
            style={{
              background: active
                ? (isDarkTheme ? "rgba(100,170,255,0.3)" : "rgba(100,170,255,0.2)")
                : (isDarkTheme ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)"),
              color: isDarkTheme ? "#fff" : "#333",
              border: `1px solid ${active
                ? (isDarkTheme ? "rgba(100,170,255,0.6)" : "rgba(100,170,255,0.5)")
                : (isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)")}`,
              borderRadius: 4,
              padding: "4px 10px",
              fontSize: 11,
              cursor: disabled ? "not-allowed" : "pointer",
              fontFamily: "monospace",
              backdropFilter: "blur(8px)",
              whiteSpace: "nowrap",
              opacity: disabled ? 0.35 : 1,
            }}
          >
            {label}
          </button>
        );
      })}
    </>
  );
}
