export type DepArrFilter = "all" | "dep" | "arr";

interface DepArrToggleProps {
  filter: DepArrFilter;
  isDarkTheme: boolean;
  onChange: (f: DepArrFilter) => void;
}

const OPTIONS: { value: DepArrFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "dep", label: "Dep" },
  { value: "arr", label: "Arr" },
];

export function DepArrToggle({ filter, isDarkTheme, onChange }: DepArrToggleProps) {
  return (
    <div style={{ display: "flex", gap: 0 }}>
      {OPTIONS.map((opt, i) => {
        const isActive = filter === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              fontFamily: "monospace",
              fontWeight: isActive ? 600 : 400,
              cursor: "pointer",
              transition: "all 0.15s",
              border: `1px solid ${isActive
                ? (isDarkTheme ? "rgba(100,170,255,0.6)" : "rgba(100,170,255,0.5)")
                : (isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)")}`,
              background: isActive
                ? (isDarkTheme ? "rgba(100,170,255,0.3)" : "rgba(100,170,255,0.2)")
                : "transparent",
              color: isActive
                ? (isDarkTheme ? "#fff" : "#1a1a1a")
                : (isDarkTheme ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)"),
              borderRadius: i === 0 ? "4px 0 0 4px" : i === OPTIONS.length - 1 ? "0 4px 4px 0" : 0,
              marginLeft: i > 0 ? -1 : 0,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
