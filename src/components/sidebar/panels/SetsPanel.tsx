import { useState, useMemo } from "react";
import type { Region, SavedAirportSet } from "../../../types";
import type { AirportManifestEntry } from "../../../data/flightLoader";
import type { AirportMeta } from "../../../data/airportMeta";
import { getContinentLabel, getCountryLabel, searchAirports, type AirportSearchCandidate } from "../../../data/airportSearch";
import { getAirportInfo } from "../../../map/cameraPresets";
import { FONT } from "../../../styles/tokens";
import type { ThemeColors } from "../theme";
import { SetChip, AirportCheckboxRow } from "../primitives";
import { SCENE_PRESETS, type ScenePreset } from "../scenePresets";

export function SetsPanel({
  airports,
  airportCatalog,
  airportMeta,
  region,
  airportSet,
  setMode,
  setName,
  savedSets,
  onApplySet,
  onToggleAirport,
  onClearSet,
  onExitSetMode,
  onSceneSelect,
  theme,
}: {
  airports: string[];
  airportCatalog: Record<string, AirportManifestEntry>;
  airportMeta: Record<string, AirportMeta>;
  region: Region;
  airportSet: string[];
  setMode: boolean;
  setName: string | null;
  savedSets: SavedAirportSet[];
  onApplySet: (set: SavedAirportSet) => void;
  onToggleAirport: (icao: string) => void;
  onClearSet: () => void;
  onExitSetMode: () => void;
  onSceneSelect: (scene: ScenePreset) => void;
  theme: ThemeColors;
}) {
  const available = new Set(airports);
  const selectedSet = new Set(airportSet);
  const [search, setSearch] = useState("");
  const [scenesOpen, setScenesOpen] = useState(false);
  const firstAirportMeta = airportMeta[airportSet[0] ?? ""];
  const defaultCatalogGroup = firstAirportMeta?.country === "TW" || firstAirportMeta?.country === "JP"
    ? firstAirportMeta.country
    : firstAirportMeta?.continent || (region === "US" ? "NA" : region === "UK" ? "EU" : "AS");
  const [openContinents, setOpenContinents] = useState<Set<string>>(new Set([defaultCatalogGroup]));
  const [openCountries, setOpenCountries] = useState<Set<string>>(new Set());

  const catalogIcaos = useMemo(
    () => Array.from(new Set([...Object.keys(airportMeta), ...airports])).sort(),
    [airportMeta, airports],
  );

  const searchCandidates = useMemo<AirportSearchCandidate[]>(
    () => catalogIcaos.map((icao) => ({
      icao,
      meta: airportMeta[icao],
      curatedName: getAirportInfo(icao)?.name,
      selectable: available.has(icao),
      flights: airportCatalog[icao]?.flights ?? 0,
    })),
    [catalogIcaos, airportMeta, airportCatalog, airports],
  );

  const searchResults = useMemo(() => {
    return searchAirports(search, searchCandidates);
  }, [search, searchCandidates]);

  const groupedCatalog = useMemo(() => {
    const byGroup = new Map<string, Map<string, string[]>>();
    for (const icao of catalogIcaos) {
      const meta = airportMeta[icao];
      const continent = meta?.continent || "ZZ";
      const country = meta?.country || "ZZ";
      const group = country === "TW" || country === "JP" ? country : continent;
      const countries = byGroup.get(group) ?? new Map<string, string[]>();
      const countryAirports = countries.get(country) ?? [];
      countryAirports.push(icao);
      countries.set(country, countryAirports);
      byGroup.set(group, countries);
    }

    const groupOrder = ["TW", "JP", "AS", "EU", "NA", "SA", "AF", "OC", "ZZ"];
    const groupLabels: Record<string, string> = { TW: "台灣", JP: "日本", AS: "亞洲其他" };
    return Array.from(byGroup.entries())
      .map(([group, countries]) => ({
        key: group,
        label: groupLabels[group] ?? getContinentLabel(group),
        flattenCountries: group === "TW" || group === "JP",
        countries: Array.from(countries.entries())
          .map(([country, icaos]) => {
            const sortedIcaos = icaos.sort((a, b) =>
              Number(available.has(b)) - Number(available.has(a)) ||
              (airportCatalog[b]?.flights ?? 0) - (airportCatalog[a]?.flights ?? 0) ||
              a.localeCompare(b));
            return {
              key: `${group}:${country}`,
              code: country,
              label: getCountryLabel(country),
              icaos: sortedIcaos,
              flightCount: sortedIcaos.reduce((sum, icao) => sum + (airportCatalog[icao]?.flights ?? 0), 0),
            };
          })
          .sort((a, b) => b.flightCount - a.flightCount || a.label.localeCompare(b.label, "zh-Hant")),
      }))
      .sort((a, b) => groupOrder.indexOf(a.key) - groupOrder.indexOf(b.key));
  }, [catalogIcaos, airportMeta, airportCatalog, airports]);

  const toggleSetKey = (setter: typeof setOpenContinents, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const filteredScenes = SCENE_PRESETS.filter(
    (scene) => !scene.region || scene.region === region || region === "all",
  );

  const matchedSavedSetId = setName
    ? savedSets.find((s) => s.shortName === setName)?.id ?? null
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          flexShrink: 0,
          paddingBottom: 2,
          background: theme.BG_RAIL,
          boxShadow: `0 1px 0 ${theme.BORDER}`,
        }}
      >
        {/* Header: 已選 + 動作 */}
        <div style={{ padding: "4px 8px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontSize: 11, color: theme.ACCENT, lineHeight: 1.3 }}>
            已選 <strong style={{ color: theme.ACTIVE_TEXT }}>{airportSet.length}</strong> 座
            {setName && (
              <span style={{ marginLeft: 6, fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>· {setName}</span>
            )}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={onClearSet}
              disabled={airportSet.length === 0}
              style={{
                padding: "2px 8px", fontSize: 10, borderRadius: 4,
                background: "transparent", border: `1px solid ${theme.BORDER}`,
                color: airportSet.length === 0 ? theme.DISABLED_TEXT : theme.DIM,
                cursor: airportSet.length === 0 ? "default" : "pointer",
              }}
            >
              清空
            </button>
            {setMode && (
              <button
                onClick={onExitSetMode}
                style={{
                  padding: "2px 8px", fontSize: 10, borderRadius: 4,
                  background: "transparent", border: `1px solid ${theme.BORDER}`,
                  color: theme.DIM, cursor: "pointer",
                }}
                title="退出組合模式（回到單一機場）"
              >
                退出
              </button>
            )}
          </div>
        </div>

        {/* Selected chips */}
        {airportSet.length > 0 && (
          <div style={{ padding: "4px 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
            {airportSet.map((icao) => (
              <SetChip key={icao} icao={icao} onRemove={() => onToggleAirport(icao)} theme={theme} />
            ))}
          </div>
        )}

        <div style={{ height: 1, background: theme.BORDER, margin: "2px 8px 6px" }} />

        <div style={{ padding: "2px 8px 8px" }}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜尋機場、國家、洲別、ICAO / IATA"
            aria-label="搜尋機場"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 7,
              border: `1px solid ${theme.BORDER}`,
              background: theme.SELECT_BG,
              color: theme.ACTIVE_TEXT,
              fontFamily: FONT.ui,
              fontSize: 11,
              outline: "none",
            }}
          />
        </div>
      </div>

      {search.trim() && (
        <div style={{ padding: "0 4px 8px" }}>
          <div style={{ fontSize: 10, color: theme.DIM, padding: "0 4px 4px" }}>
            {searchResults.length > 0
              ? searchResults.length > 60
                ? `顯示前 60 座／共 ${searchResults.length} 座`
                : `找到 ${searchResults.length} 座機場`
              : "找不到機場"}
          </div>
          {searchResults.slice(0, 60).map((result) => {
            const meta = airportMeta[result.icao];
            return (
              <AirportCheckboxRow
                key={result.icao}
                icao={result.icao}
                name={meta?.nameZh || meta?.name || result.icao}
                iata={meta?.iata}
                checked={selectedSet.has(result.icao)}
                coverage={result.selectable ? "可加入" : "尚無軌跡"}
                matchReason={result.matchReason}
                disabled={!result.selectable}
                onToggle={() => onToggleAirport(result.icao)}
                theme={theme}
              />
            );
          })}
        </div>
      )}

      {filteredScenes.length > 0 && (
        <div style={{ margin: "0 4px 6px" }}>
          <button
            onClick={() => setScenesOpen((open) => !open)}
            aria-expanded={scenesOpen}
            style={{
              display: "flex", alignItems: "center", width: "100%", gap: 7,
              padding: "6px 4px", background: "transparent", border: "none",
              color: theme.DIM, cursor: "pointer", textAlign: "left", fontSize: 10,
            }}
          >
            <span style={{ width: 9 }}>{scenesOpen ? "▼" : "▶"}</span>
            <span style={{ flex: 1, letterSpacing: 1.1 }}>場景預設</span>
            <span style={{ fontFamily: FONT.ui }}>{filteredScenes.length}</span>
          </button>
          {scenesOpen && filteredScenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => onSceneSelect(scene)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 8px", background: "transparent", border: "none",
                borderRadius: 6, cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(event) => { event.currentTarget.style.background = theme.HOVER_BG; }}
              onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 3, height: 24, borderRadius: 2, background: theme.SCENE_BAR, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: theme.ACCENT }}>{scene.name}</div>
                <div style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>{scene.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Saved Sets */}
      <div style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2, padding: "2px 8px 4px" }}>
        預設組合
      </div>
      {savedSets.map((s) => {
        const isActive = s.id === matchedSavedSetId;
        return (
          <button
            key={s.id}
            onClick={() => onApplySet(s)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 8px",
              background: isActive ? theme.ACTIVE_BTN_BG : "transparent",
              border: "none", borderRadius: 6,
              cursor: "pointer", textAlign: "left", width: "100%",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = theme.HOVER_BG; }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ width: 3, height: 24, borderRadius: 2, background: isActive ? theme.ACCENT_BLUE : theme.SCENE_BAR, flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: isActive ? theme.ACTIVE_TEXT : theme.ACCENT, lineHeight: 1.3 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>
                {s.icaos.length} 座 · {s.icaos.slice(0, 4).join(" · ")}{s.icaos.length > 4 ? " …" : ""}
              </div>
            </div>
          </button>
        );
      })}

      <div style={{ height: 1, background: theme.BORDER, margin: "8px 8px 6px" }} />

      {/* Complete airport directory: Taiwan / Japan / continent → country → airport */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 8px 4px" }}>
        <span style={{ fontSize: 10, color: theme.DIM, letterSpacing: 1.2 }}>全部機場</span>
        <span style={{ fontSize: 9, color: theme.DIM, fontFamily: FONT.ui }}>
          {catalogIcaos.length.toLocaleString()} 座 · {airports.length.toLocaleString()} 座可加入
        </span>
      </div>
      {groupedCatalog.map((continent) => {
        const open = openContinents.has(continent.key);
        const continentIcaos = continent.countries.flatMap((country) => country.icaos);
        const selectedInGroup = continentIcaos.filter((icao) => selectedSet.has(icao)).length;
        return (
          <div key={continent.key}>
            <button
              onClick={() => toggleSetKey(setOpenContinents, continent.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 8px", width: "100%",
                background: "transparent", border: "none",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = theme.HOVER_BG; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 9, color: theme.DIM, width: 8, display: "inline-block" }}>
                {open ? "▼" : "▶"}
              </span>
              <span style={{ fontSize: 11, color: theme.ACCENT, flex: 1 }}>
                {continent.label}
              </span>
              <span style={{ fontSize: 10, color: theme.DIM, fontFamily: FONT.ui }}>
                {selectedInGroup > 0 ? `${selectedInGroup}/` : ""}{continentIcaos.length}
              </span>
            </button>
            {open && continent.flattenCountries && continentIcaos.map((icao) => {
              const meta = airportMeta[icao];
              const selectable = available.has(icao);
              return (
                <div key={icao} style={{ paddingLeft: 8 }}>
                  <AirportCheckboxRow
                    icao={icao}
                    name={meta?.nameZh || meta?.name || icao}
                    iata={meta?.iata}
                    checked={selectedSet.has(icao)}
                    coverage={selectable ? undefined : "尚無軌跡"}
                    disabled={!selectable}
                    onToggle={() => onToggleAirport(icao)}
                    theme={theme}
                  />
                </div>
              );
            })}
            {open && !continent.flattenCountries && continent.countries.map((country) => {
              const countryOpen = openCountries.has(country.key);
              const selectedInCountry = country.icaos.filter((icao) => selectedSet.has(icao)).length;
              return (
                <div key={country.key} style={{ paddingLeft: 8 }}>
                  <button
                    onClick={() => toggleSetKey(setOpenCountries, country.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%",
                      padding: "4px 8px", background: "transparent", border: "none",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 8, color: theme.DIM, width: 8 }}>{countryOpen ? "▼" : "▶"}</span>
                    <span style={{ fontSize: 10, color: theme.ACCENT, flex: 1 }}>{country.label}</span>
                    <span style={{ fontSize: 9, color: theme.DIM, fontFamily: FONT.ui }}>
                      {selectedInCountry > 0 ? `${selectedInCountry}/` : ""}{country.icaos.length}
                    </span>
                  </button>
                  {countryOpen && country.icaos.map((icao) => {
                    const meta = airportMeta[icao];
                    const selectable = available.has(icao);
                    return (
                      <AirportCheckboxRow
                        key={icao}
                        icao={icao}
                        name={meta?.nameZh || meta?.name || icao}
                        iata={meta?.iata}
                        checked={selectedSet.has(icao)}
                        coverage={selectable ? undefined : "尚無軌跡"}
                        disabled={!selectable}
                        onToggle={() => onToggleAirport(icao)}
                        theme={theme}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
