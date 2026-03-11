import {
  AIRCRAFT_CATEGORIES,
  type AircraftCategory,
  type AircraftFilterKey,
} from "../data/aircraftCategories";

interface AircraftTypeFilterProps {
  filter: AircraftFilterKey;
  isDarkTheme: boolean;
  availableTypes: string[];
  onChange: (filter: AircraftFilterKey) => void;
}

/** 所有特殊機型 Set（用來判斷 availableTypes 裡哪些是特殊的） */
const ALL_SPECIAL = new Set(
  Object.values(AIRCRAFT_CATEGORIES).flatMap((c) => c.types),
);

const CATEGORY_ORDER: AircraftCategory[] = [
  "military",
  "business-jet",
  "helicopter",
  "training",
  "china-domestic",
];

export function AircraftTypeFilter({
  filter,
  isDarkTheme,
  availableTypes,
  onChange,
}: AircraftTypeFilterProps) {
  // 找出資料中實際存在的特殊機型
  const specialInData = availableTypes.filter((t) => ALL_SPECIAL.has(t));
  const categoriesInData = CATEGORY_ORDER.filter((cat) =>
    AIRCRAFT_CATEGORIES[cat].types.some((t) => availableTypes.includes(t)),
  );

  const hasSpecial = specialInData.length > 0;

  return (
    <select
      value={filter}
      onChange={(e) => onChange(e.target.value as AircraftFilterKey)}
      style={{
        background: filter !== "all"
          ? (isDarkTheme ? "rgba(100,170,255,0.3)" : "rgba(100,170,255,0.2)")
          : (isDarkTheme ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.85)"),
        color: isDarkTheme ? "#fff" : "#333",
        border: `1px solid ${filter !== "all"
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
      <option value="all">All Types</option>
      {hasSpecial && (
        <>
          <option disabled>──────────</option>
          <option value="all-special">All Special</option>
          {categoriesInData.map((cat) => (
            <option key={cat} value={`cat:${cat}`}>
              {AIRCRAFT_CATEGORIES[cat].label}
            </option>
          ))}
        </>
      )}
      {specialInData.length > 0 && (
        <>
          <option disabled>──────────</option>
          {specialInData.sort().map((t) => (
            <option key={t} value={`type:${t}`}>
              {t}
            </option>
          ))}
        </>
      )}
    </select>
  );
}
