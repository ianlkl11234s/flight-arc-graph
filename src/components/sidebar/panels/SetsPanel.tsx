import { useState, useMemo } from "react";
import type { Region, SavedAirportSet } from "../../../types";
import type { AirportManifestEntry } from "../../../data/flightLoader";
import type { AirportMeta } from "../../../data/airportMeta";
import { getContinentLabel, getCountryLabel, searchAirports, type AirportSearchCandidate } from "../../../data/airportSearch";
import { getAirportInfo } from "../../../map/cameraPresets";
import { useTheme } from "../../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE } from "../../../styles/tokens";
import { Button, Chip, Section, Segmented } from "../../../ui";
import { IconChevron } from "../../../ui/icons";
import { themeVars } from "../../../ui/vars";
import { AirportColumnHeader, AirportRow, statColWidth, type AirportStats } from "../primitives";
import { getArrDep, getTotalOrNull, nextSort, parseSort, serializeSort, sortAirports, type AirportSort } from "../../../data/airportListStats";
import { SCENE_PRESETS, type ScenePreset } from "../scenePresets";

export type SetsTab = "airports" | "sets" | "scenes";
const TAB_KEY = "fa-sets-tab";
/** 值格式 `key:dir`；舊版只存 key（tot/arr/dep/name），由 parseSort 遷移 */
const SORT_KEY = "fa-sets-sort";

function loadSort(): AirportSort {
  try {
    return parseSort(localStorage.getItem(SORT_KEY));
  } catch { /* localStorage 不可用 */ }
  return parseSort(null);
}

export function loadSetsTab(): SetsTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "airports" || v === "sets" || v === "scenes") return v;
  } catch { /* localStorage 不可用 */ }
  return "airports";
}

function saveTab(tab: SetsTab) {
  try { localStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
}

export function SetsPanel({
  airports,
  airportCatalog,
  airportMeta,
  region,
  selectedAirport,
  airportSet,
  setMode,
  setName,
  savedSets,
  onApplySet,
  onOpenAirport,
  onToggleAirport,
  onClearSet,
  onExitSetMode,
  onSceneSelect,
  statDates,
  onTabChange,
}: {
  airports: string[];
  airportCatalog: Record<string, AirportManifestEntry>;
  airportMeta: Record<string, AirportMeta>;
  region: Region;
  /** 目前單選的機場（非組合模式時列表標「目前」） */
  selectedAirport: string;
  airportSet: string[];
  setMode: boolean;
  setName: string | null;
  savedSets: SavedAirportSet[];
  onApplySet: (set: SavedAirportSet) => void;
  /** 點擊／搜尋結果：單選並飛過去（R11） */
  onOpenAirport: (icao: string) => void;
  /** ＋／Shift+點：加入或移出組合 */
  onToggleAirport: (icao: string) => void;
  onClearSet: () => void;
  onExitSetMode: () => void;
  onSceneSelect: (scene: ScenePreset) => void;
  /** 數字欄統計的日期（單日／連續 N 天／Compare 多日） */
  statDates: readonly string[];
  /** 分頁切換（IconRailSidebar 依此決定面板寬度：機場分頁較寬） */
  onTabChange?: (tab: SetsTab) => void;
}) {
  const { tokens } = useTheme();
  const available = new Set(airports);
  const selectedSet = new Set(airportSet);
  const [search, setSearch] = useState("");
  const [tab, setTabState] = useState<SetsTab>(loadSetsTab);
  const setTab = (next: SetsTab) => { setTabState(next); saveTab(next); onTabChange?.(next); };
  const [sort, setSortState] = useState<AirportSort>(loadSort);
  const sortKey = sort.key;
  const onSort = (key: AirportSort["key"]) => {
    const next = nextSort(sort, key);
    setSortState(next);
    try { localStorage.setItem(SORT_KEY, serializeSort(next)); } catch { /* ignore */ }
  };
  const applySet = (set: SavedAirportSet) => { onApplySet(set); setTab("sets"); };
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

  const nameOf = (icao: string) => airportMeta[icao]?.nameZh || airportMeta[icao]?.name || icao;
  const sortCtx = { catalog: airportCatalog, dates: statDates, nameOf, available };

  const searchResults = useMemo(() => {
    const found = searchAirports(search, searchCandidates);
    const order = sortAirports(found.map((r) => r.icao), sortKey, sortCtx, sort.dir);
    const rank = new Map(order.map((icao, i) => [icao, i]));
    return [...found].sort((a, b) => rank.get(a.icao)! - rank.get(b.icao)!);
  }, [search, searchCandidates, sort, statDates, airportCatalog, airportMeta, airports]);

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
            const sortedIcaos = sortAirports(icaos, sortKey, sortCtx, sort.dir);
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
  }, [catalogIcaos, airportMeta, airportCatalog, airports, sort, statDates]);

  /** 每座機場的總／進／離（目錄＋搜尋共用）與數字欄寬（依最大值位數固定） */
  const statsOf = useMemo(() => {
    const cache = new Map<string, AirportStats>();
    return (icao: string): AirportStats => {
      let v = cache.get(icao);
      if (!v) {
        const entry = airportCatalog[icao];
        v = { tot: getTotalOrNull(entry, statDates), ...getArrDep(entry, statDates) };
        cache.set(icao, v);
      }
      return v;
    };
  }, [airportCatalog, statDates]);
  const colWidth = useMemo(
    () => statColWidth(catalogIcaos.flatMap((icao) => { const v = statsOf(icao); return [v.tot, v.arr, v.dep]; })),
    [catalogIcaos, statsOf],
  );

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

  const rowBase = {
    ...themeVars(tokens),
    display: "flex",
    alignItems: "center",
    gap: SPACE.s8,
    width: "100%",
    background: "transparent",
    border: "none",
    textAlign: "left" as const,
    cursor: "pointer",
    fontFamily: FONT.ui,
  };
  const eyebrow = { fontSize: SIZE.eyebrow, color: tokens.fg3, letterSpacing: ".18em", textTransform: "uppercase" as const, fontFamily: FONT.data };

  const rowProps = (icao: string) => ({
    current: !setMode && icao === selectedAirport,
    inSet: setMode && selectedSet.has(icao),
    onOpen: () => onOpenAirport(icao),
    onToggleSet: () => onToggleAirport(icao),
  });

  const airportRow = (icao: string, indent = 0) => {
    const meta = airportMeta[icao];
    const selectable = available.has(icao);
    return (
      <AirportRow
        key={icao}
        icao={icao}
        name={meta?.nameZh || meta?.name || icao}
        iata={meta?.iata}
        coverage={selectable ? undefined : "尚無軌跡"}
        disabled={!selectable}
        stats={statsOf(icao)}
        colWidth={colWidth}
        indent={indent}
        {...rowProps(icao)}
      />
    );
  };

  // 版面：頂部（分頁／搜尋／欄首）不捲動、直接坐在面板底色上；下方清單自己捲動 ——
  // 欄首因此恆在清單頂端（等同 sticky），不需要另一塊不透明底色。
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          flex: "none",
          display: "flex",
          flexDirection: "column",
          gap: SPACE.s8,
          padding: `${SPACE.s4}px 0 ${tab === "airports" ? 0 : SPACE.s8}px`,
        }}
      >
        <Segmented<SetsTab>
          fullWidth
          ariaLabel="機場面板分頁"
          options={[
            { value: "airports", label: "機場" },
            { value: "sets", label: "組合" },
            { value: "scenes", label: "場景" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "airports" && (
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜尋機場、國家、洲別、ICAO / IATA"
              aria-label="搜尋機場"
              className="fa-focus"
              style={{
                ...themeVars(tokens),
                width: "100%",
                boxSizing: "border-box",
                height: 28,
                padding: `0 ${SPACE.s8 + SPACE.s2}px`,
                borderRadius: RADIUS.base,
                border: `1px solid ${tokens.border}`,
                background: tokens.ctl,
                color: tokens.fg1,
                fontFamily: FONT.ui,
                fontSize: SIZE.body,
              }}
            />
            <AirportColumnHeader sortKey={sortKey} sortDir={sort.dir} colWidth={colWidth} onSort={onSort} />
          </>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: SPACE.s2, paddingTop: SPACE.s2 }}>

      {tab === "airports" && search.trim() && (
        <div style={{ paddingBottom: SPACE.s8 }}>
          <div style={{ fontSize: SIZE.minor, color: tokens.fg3, padding: `${SPACE.s4}px ${SPACE.s4}px` }}>
            {searchResults.length > 0
              ? searchResults.length > 60
                ? `顯示前 60 座／共 ${searchResults.length} 座`
                : `找到 ${searchResults.length} 座機場`
              : "找不到機場"}
          </div>
          {searchResults.slice(0, 60).map((result) => {
            const meta = airportMeta[result.icao];
            return (
              <AirportRow
                key={result.icao}
                icao={result.icao}
                name={meta?.nameZh || meta?.name || result.icao}
                iata={meta?.iata}
                coverage={result.selectable ? undefined : "尚無軌跡"}
                matchReason={result.matchReason}
                stats={statsOf(result.icao)}
                colWidth={colWidth}
                disabled={!result.selectable}
                {...rowProps(result.icao)}
              />
            );
          })}
        </div>
      )}

      {tab === "sets" && (
        <>
          {/* 目前組合：只在組合模式出現 */}
          {setMode ? (
            <Section title="CURRENT · 目前組合">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE.s8 }}>
                <div style={{ fontSize: SIZE.body, color: tokens.fg2, lineHeight: 1.3, fontFamily: FONT.ui }}>
                  組合 <strong style={{ color: tokens.fg1, fontFamily: FONT.data }}>{airportSet.length}</strong> 座
                  {setName && (
                    <span style={{ marginLeft: SPACE.s6, fontSize: SIZE.minor, color: tokens.fg3 }}>· {setName}</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: SPACE.s4 }}>
                  <Button onClick={onClearSet} disabled={airportSet.length === 0}>清空</Button>
                  <Button onClick={onExitSetMode} title="退出組合模式（回到單一機場）">退出</Button>
                </div>
              </div>
              {airportSet.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s4 }}>
                  {airportSet.map((icao) => {
                    const info = getAirportInfo(icao);
                    return (
                      <Chip
                        key={icao}
                        selected
                        label={info?.iata ?? icao}
                        title={info?.name ?? icao}
                        onRemove={() => onToggleAirport(icao)}
                      />
                    );
                  })}
                </div>
              )}
            </Section>
          ) : (
            <div style={{ fontSize: SIZE.minor, color: tokens.fg3, lineHeight: 1.45, fontFamily: FONT.ui, padding: `${SPACE.s4}px ${SPACE.s8}px` }}>
              目前是單一機場。到「機場」分頁按列尾 ＋ 加入組合，或直接套用下方預設組合。
            </div>
          )}

      <Section title="PRESETS · 預設組合">
        {savedSets.map((s) => {
          const isActive = s.id === matchedSavedSetId;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => applySet(s)}
              className="fa-focus fa-hover"
              style={{
                ...rowBase,
                padding: `${SPACE.s6}px ${SPACE.s8}px`,
                background: isActive ? tokens.accentSoft : "transparent",
                borderRadius: RADIUS.base,
              }}
            >
              <span style={{ width: 2, height: 24, background: isActive ? tokens.accent : tokens.border, flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: SIZE.body, color: isActive ? tokens.fg1 : tokens.fg2, lineHeight: 1.3 }}>
                  {s.name}
                </div>
                <div style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data }}>
                  {s.icaos.length} 座 · {s.icaos.slice(0, 4).join(" · ")}{s.icaos.length > 4 ? " …" : ""}
                </div>
              </div>
            </button>
          );
        })}
      </Section>

        </>
      )}

      {tab === "scenes" && (
        <>
      {filteredScenes.length > 0 && (
        <Section
          title="SCENES · 場景預設"
          right={<span style={{ fontFamily: FONT.data, fontSize: SIZE.minor, letterSpacing: 0 }}>{filteredScenes.length}</span>}
        >
          {filteredScenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSceneSelect(scene)}
              className="fa-focus fa-hover"
              style={{ ...rowBase, padding: `${SPACE.s6}px ${SPACE.s8}px`, borderRadius: RADIUS.base }}
            >
              <span style={{ width: 2, height: 24, background: tokens.accent, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: SIZE.body, color: tokens.fg1 }}>{scene.name}</div>
                <div style={{ fontSize: SIZE.minor, color: tokens.fg3 }}>{scene.desc}</div>
              </div>
            </button>
          ))}
        </Section>
      )}

          {filteredScenes.length === 0 && (
            <div style={{ fontSize: SIZE.minor, color: tokens.fg3, padding: `${SPACE.s4}px ${SPACE.s8}px` }}>此區域沒有場景預設</div>
          )}
        </>
      )}

      {tab === "airports" && (
        <>
        {search.trim() && <div style={{ height: 1, background: tokens.border, margin: `${SPACE.s8}px 0 ${SPACE.s4}px` }} />}

        {/* Complete airport directory: Taiwan / Japan / continent → country → airport */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", columnGap: SPACE.s6, rowGap: SPACE.s2, padding: `${SPACE.s2}px ${SPACE.s8}px ${SPACE.s4}px` }}>
          <span style={{ ...eyebrow, whiteSpace: "nowrap" }}>ALL · 全部機場</span>
          <span style={{ fontSize: SIZE.eyebrow, color: tokens.fg3, fontFamily: FONT.data, whiteSpace: "nowrap" }}>
            {catalogIcaos.length.toLocaleString()} 座 · {airports.length.toLocaleString()} 座有軌跡
          </span>
        </div>
        {groupedCatalog.map((continent) => {
          const open = openContinents.has(continent.key);
          const continentIcaos = continent.countries.flatMap((country) => country.icaos);
          const selectedInGroup = continentIcaos.filter((icao) => selectedSet.has(icao)).length;
          return (
            <div key={continent.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleSetKey(setOpenContinents, continent.key)}
                className="fa-focus fa-hover"
                style={{ ...rowBase, gap: SPACE.s6, padding: `${SPACE.s4}px ${SPACE.s8}px`, color: tokens.fg3 }}
              >
                <IconChevron size={9} direction={open ? "down" : "right"} />
                <span style={{ fontSize: SIZE.body, color: tokens.fg1, flex: 1 }}>{continent.label}</span>
                <span style={{ fontSize: SIZE.minor, color: tokens.fg3, fontFamily: FONT.data }}>
                  {selectedInGroup > 0 ? `${selectedInGroup}/` : ""}{continentIcaos.length}
                </span>
              </button>
              {open && continent.flattenCountries && continentIcaos.map((icao) => airportRow(icao, SPACE.s8))}
              {open && !continent.flattenCountries && continent.countries.map((country) => {
                const countryOpen = openCountries.has(country.key);
                const selectedInCountry = country.icaos.filter((icao) => selectedSet.has(icao)).length;
                return (
                  <div key={country.key}>
                    <button
                      type="button"
                      aria-expanded={countryOpen}
                      onClick={() => toggleSetKey(setOpenCountries, country.key)}
                      className="fa-focus fa-hover"
                      style={{ ...rowBase, gap: SPACE.s6, padding: `${SPACE.s4}px ${SPACE.s8}px ${SPACE.s4}px ${SPACE.s8 * 2}px`, color: tokens.fg3 }}
                    >
                      <IconChevron size={8} direction={countryOpen ? "down" : "right"} />
                      <span style={{ fontSize: SIZE.minor, color: tokens.fg2, flex: 1 }}>{country.label}</span>
                      <span style={{ fontSize: SIZE.eyebrow, color: tokens.fg3, fontFamily: FONT.data }}>
                        {selectedInCountry > 0 ? `${selectedInCountry}/` : ""}{country.icaos.length}
                      </span>
                    </button>
                    {countryOpen && country.icaos.map((icao) => airportRow(icao, SPACE.s8))}
                  </div>
                );
              })}
            </div>
          );
        })}
        </>
      )}
      </div>
    </div>
  );
}
