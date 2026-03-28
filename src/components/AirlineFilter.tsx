interface AirlineFilterProps {
  filter: string;
  isDarkTheme: boolean;
  availableAirlines: { code: string; count: number }[];
  onChange: (code: string) => void;
}

export function AirlineFilter({
  filter,
  isDarkTheme,
  availableAirlines,
  onChange,
}: AirlineFilterProps) {
  if (availableAirlines.length === 0) return null;

  const isActive = filter !== "all";
  return (
    <select
      value={filter}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: isActive
          ? (isDarkTheme ? "rgba(100,170,255,0.3)" : "rgba(100,170,255,0.2)")
          : (isDarkTheme ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)"),
        color: isDarkTheme ? "#fff" : "#333",
        border: `1px solid ${isActive
          ? (isDarkTheme ? "rgba(100,170,255,0.6)" : "rgba(100,170,255,0.5)")
          : (isDarkTheme ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.12)")}`,
        borderRadius: 4,
        padding: "4px 6px",
        fontSize: 11,
        fontFamily: "monospace",
        backdropFilter: "blur(8px)",
        cursor: "pointer",
        WebkitAppearance: "none",
        MozAppearance: "none",
        appearance: "none",
        paddingRight: 18,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='${isDarkTheme ? "white" : "%23333"}'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 5px center",
      }}
    >
      <option value="all">All Airlines</option>
      <option disabled>──────────</option>
      {availableAirlines.map((a) => (
        <option key={a.code} value={a.code}>
          {a.code} ({a.count})
        </option>
      ))}
    </select>
  );
}
