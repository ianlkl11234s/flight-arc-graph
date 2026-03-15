import { useState } from "react";
import { TIPS_BY_CATEGORY } from "../data/tips";

type BottomTab = "guide" | "about" | "profile";
type GuidePage = "getting-started" | "feature-legend" | "data-sources" | "tips";
type Lang = "zh" | "en";

interface InfoModalProps {
  open: boolean;
  onClose: () => void;
  isMobile: boolean;
}

/* ── 樣式常量 ── */
const S = {
  bg: "rgba(14,14,22,0.96)",
  border: "rgba(255,255,255,0.1)",
  cardBg: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  label: "rgba(255,255,255,0.4)",
  text: "rgba(255,255,255,0.85)",
  sub: "rgba(255,255,255,0.5)",
  active: "#64aaff",
  font: "monospace",
} as const;

/* ── i18n helper ── */
type T = { zh: string; en: string };
const t = (obj: T, lang: Lang) => obj[lang];

/* ── Sub-components ── */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: 11, color: S.label, margin: "0 0 10px", letterSpacing: 1.5, textTransform: "uppercase" }}>
      {children}
    </h3>
  );
}

function Card({ title, children, accentColor, style }: {
  title?: string;
  children: React.ReactNode;
  accentColor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{
      background: S.cardBg,
      border: `1px solid ${S.cardBorder}`,
      borderRadius: 8,
      padding: "12px 14px",
      borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
      ...style,
    }}>
      {title && <div style={{ fontSize: 12, color: S.text, fontWeight: 600, marginBottom: 6 }}>{title}</div>}
      <div style={{ fontSize: 12, lineHeight: 1.7, color: S.sub }}>{children}</div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      background: S.cardBg,
      border: `1px solid ${S.cardBorder}`,
      borderRadius: 4,
      fontSize: 11,
      color: S.sub,
    }}>
      {children}
    </span>
  );
}

function KeyBadge({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 6px",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 3,
      fontSize: 11,
      fontFamily: S.font,
      color: S.text,
    }}>
      {children}
    </span>
  );
}

function ParamRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 12, lineHeight: 1.6, marginBottom: 4 }}>
      <span style={{ color: S.active, fontWeight: 600, minWidth: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ color: S.sub }}>{desc}</span>
    </div>
  );
}

/* ── Guide Pages ── */

function GettingStartedPage({ lang }: { lang: Lang }) {
  const L = lang === "zh";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 13, lineHeight: 1.8, color: S.text, margin: 0 }}>
        {L
          ? <>歡迎使用 <b>Flight Arc</b> — 以 3D 弧線呈現航班軌跡的生成式藝術作品。</>
          : <>Welcome to <b>Flight Arc</b> — a generative art piece visualizing flight trajectories as 3D luminous arcs across East Asia and beyond.</>
        }
      </p>

      <SectionTitle>{L ? "地圖操作" : "MAP CONTROLS"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        <Card title={L ? "旋轉視角" : "Rotate View"}>
          <KeyBadge>{L ? "右鍵" : "Right-click"}</KeyBadge> + {L ? "拖曳 — 改變俯仰角（pitch）與方位角（bearing）" : "Drag — Change pitch and bearing angles"}
        </Card>
        <Card title={L ? "縮放地圖" : "Zoom Map"}>
          <KeyBadge>{L ? "滾輪" : "Scroll wheel"}</KeyBadge> {L ? "上下滾動 — 放大或縮小地圖" : "— Zoom in or out"}
        </Card>
        <Card title={L ? "平移地圖" : "Pan Map"}>
          <KeyBadge>{L ? "左鍵" : "Left-click"}</KeyBadge> + {L ? "拖曳 — 移動地圖中心位置" : "Drag — Move the map center"}
        </Card>
      </div>

      <SectionTitle>{L ? "點擊互動" : "CLICK INTERACTIONS"}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card title={L ? "點擊飛機光球" : "Click Flight Orb"}>
          {L
            ? "顯示航班浮動資訊卡：航班號（callsign）、起降機場、飛行高度、機型。再次點擊其他位置可關閉。"
            : "Shows a floating info card with callsign, departure/arrival airports, altitude, and aircraft type. Click elsewhere to dismiss."}
        </Card>
        <Card title={L ? "雙擊光球" : "Double-click Orb"}>
          {L
            ? "進入 Track Single 模式，鏡頭追蹤該航班飛行。按 ESC 退出追蹤。"
            : "Enters Track Single mode — the camera follows the selected flight. Press ESC to exit tracking."}
        </Card>
      </div>

      <SectionTitle>{L ? "工具列" : "TOOLBAR"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
        <Card title={L ? "底圖模式" : "Map Style"}>
          {L
            ? "下拉選單切換 6 種 Mapbox 底圖：Dark · Light · Satellite · Satellite Streets · Navigation Night · Streets"
            : "Dropdown to switch between 6 Mapbox styles: Dark · Light · Satellite · Satellite Streets · Navigation Night · Streets"}
        </Card>
        <Card title="Capture">
          {L
            ? <>進入拍攝模式 — 畫面加上電影感暗角（vignette）、標題和時間戳記。按 <KeyBadge>ESC</KeyBadge> 退出。</>
            : <>Enter capture mode — adds a cinematic vignette, title overlay, and timestamp. Press <KeyBadge>ESC</KeyBadge> to exit.</>
          }
        </Card>
        <Card title="3D / 2D">
          {L
            ? <><b>3D Altitude</b>：航線依實際高度呈現弧線 + Three.js 光球。<b>2D Flat</b>：所有航班投影到平面上。</>
            : <><b>3D Altitude</b>: Flight arcs rendered at actual altitude with Three.js orbs. <b>2D Flat</b>: All flights projected onto a flat plane.</>
          }
        </Card>
        <Card title="Data Source">
          {L
            ? <><b>航線軌跡</b>：FR24 API 精細航線軌跡，涵蓋台灣、日本、香港及更多地區機場，細節豐富。<b>空域快照</b>：OpenSky 空域掃描，涵蓋東亞附近所有飛機，覆蓋完整但軌跡較粗。</>
            : <><b>Route Tracks</b>: FR24 API detailed route trajectories covering airports across Taiwan, Japan, Hong Kong, and beyond. <b>Airspace Scan</b>: OpenSky airspace scan covering all aircraft across East Asia with broader coverage but coarser trails.</>
          }
        </Card>
        <Card title="Aircraft Filter">
          {L
            ? "依機型分類篩選：Military / Business Jet / Helicopter / Turboprop / Narrowbody / Widebody 等類別。"
            : "Filter by aircraft category: Military / Business Jet / Helicopter / Turboprop / Narrowbody / Widebody, etc."}
        </Card>
        <Card title="Scope">
          {L
            ? <><b>This Airport</b>：僅顯示選定機場的起降航班。<b>All Region</b>：顯示當前區域所有航班（All Taiwan / All Japan 等）。<b>Stack All</b>：同時顯示所有航班。<b>Track Single</b>：追蹤單一航班，鏡頭鎖定跟隨。使用 Region pills（TW/JP/HK/World/All）切換不同區域。</>
            : <><b>This Airport</b>: Only flights for the selected airport. <b>All Region</b>: All flights in the current region (All Taiwan / All Japan, etc.). <b>Stack All</b>: Display all flights at once. <b>Track Single</b>: Follow a single flight with camera lock. Use Region pills (TW/JP/HK/World/All) to switch between regions.</>
          }
        </Card>
        <Card title="Display Mode">
          {L
            ? <><b>Flight Trails</b>：完整軌跡線 + 光球動畫。<b>Live Status</b>：僅顯示即時位置光球，無軌跡線。勾選 <b>±12h Window</b> 可僅顯示當前播放時間前後 12 小時的航班，減少畫面雜訊。</>
            : <><b>Flight Trails</b>: Full trajectory lines + orb animation. <b>Live Status</b>: Only real-time position orbs, no trail lines. Enable <b>±12h Window</b> to show only flights within 12 hours of the current playback time, reducing visual clutter.</>
          }
        </Card>
      </div>
    </div>
  );
}

function FeatureLegendPage({ lang }: { lang: Lang }) {
  const L = lang === "zh";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <SectionTitle>{L ? "視覺元素" : "VISUAL ELEMENTS"}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card title={L ? "光軌 Light Trail" : "Light Trail"} accentColor="#64aaff">
          {L
            ? "彗尾漸層效果 — 飛機後方拖曳的發光軌跡，長度隨速度變化，顏色依高度著色（暖橘 → 冷藍）。"
            : "Comet-tail gradient effect — glowing trail behind the aircraft, length varies with speed, colored by altitude (warm orange → cool blue)."}
        </Card>
        <Card title={L ? "光球 Flight Orb" : "Flight Orb"} accentColor="#ffcc00">
          {L
            ? "呼吸動畫 — 飛機位置以發光球體標示，帶有脈動呼吸效果，大小可透過 Orb 參數調整。"
            : "Breathing animation — aircraft position marked with a glowing sphere with pulsating effect, size adjustable via the Orb parameter."}
        </Card>
        <Card title={L ? "閃爍燈 Anti-collision" : "Anti-collision Light"} accentColor="#ff4444">
          {L
            ? "紅色防撞燈 — 模擬真實飛機的防撞閃光燈，週期性閃爍。"
            : "Red anti-collision light — simulates real aircraft anti-collision strobe, periodically flashing."}
        </Card>
        <Card title={L ? "靜態軌跡 Static Trail" : "Static Trail"} accentColor="#8888ff">
          {L
            ? "依高度著色的飛行路徑線 — 顯示完整歷史航跡，透明度可透過 Opacity 參數調整。"
            : "Altitude-colored flight path lines — shows complete historical trajectory, transparency adjustable via Opacity parameter."}
        </Card>
      </div>

      <SectionTitle>{L ? "參數調整" : "PARAMETER CONTROLS"}</SectionTitle>
      <div style={{ borderTop: `1px solid ${S.cardBorder}`, paddingTop: 8 }}>
        <ParamRow label="Alt" desc={L ? "高度誇張倍率（1~5）。數值越大，航線弧線越高聳誇張。" : "Altitude exaggeration (1-5). Higher values make flight arcs taller."} />
        <ParamRow label="Z offset" desc={L ? "基準高度偏移（0~200m）。讓弧線整體往上抬升，避免低空航線貼地。" : "Base altitude offset (0-200m). Lifts all arcs upward to prevent ground clipping."} />
        <ParamRow label="Opacity" desc={L ? "靜態軌跡線透明度（0.02~0.5）。數值越大，歷史航線越明顯。" : "Static trail opacity (0.02-0.5). Higher values make historical paths more visible."} />
        <ParamRow label="Orb" desc={L ? "飛行光球大小。數值越大，光球越醒目。" : "Flight orb size. Larger values make orbs more visible."} />
        <ParamRow label="APT" desc={L ? "機場區域填充透明度（0~0.3）。控制機場邊界底色的深淺。" : "Airport fill opacity (0-0.3). Controls airport boundary shading intensity."} />
        <ParamRow label="Glow" desc={L ? "機場光暈強度（0~2）。讓機場周圍散發光暈效果。" : "Airport glow intensity (0-2). Creates a glow effect around airports."} />
      </div>

      <SectionTitle>{L ? "機場標記" : "AIRPORT MARKERS"}</SectionTitle>
      <Card>
        {L
          ? "機場邊界以 OpenStreetMap 多邊形繪製，搭配可調整的光暈效果（Glow 參數）。涵蓋台灣、日本、香港等地共 95+ 座機場。"
          : "Airport boundaries drawn using OpenStreetMap polygons with adjustable glow effect (Glow parameter). Covers 95+ airports across Taiwan, Japan, Hong Kong, and more."}
      </Card>
    </div>
  );
}

function DataSourcesPage({ lang }: { lang: Lang }) {
  const L = lang === "zh";
  const sources = [
    {
      name: { zh: "航線軌跡 — FlightRadar24 API", en: "Route Tracks — FlightRadar24 API" },
      source: "FR24 Explorer API",
      desc: { zh: "涵蓋台灣、日本、香港及世界各地 95+ 座機場的精細軌跡資料。透過 flight-summary/light 端點取得航班清單，再逐航班擷取詳細軌跡點（經緯度、高度、速度、時間戳）。支援按機場 lazy loading，軌跡細緻清晰。", en: "Detailed trajectory data covering 95+ airports across Taiwan, Japan, Hong Kong, and beyond. Flight lists retrieved via flight-summary/light endpoint, then per-flight track points (lat/lon, altitude, speed, timestamp) fetched. Supports per-airport lazy loading for efficient data delivery." },
      color: "#64aaff",
    },
    {
      name: { zh: "空域快照 — OpenSky Network", en: "Airspace Scan — OpenSky Network" },
      source: "OpenSky / ADS-B",
      desc: { zh: "東亞附近空域的全覆蓋掃描 — 以 OpenSky Network 為主要資料來源，持續更新區域內所有飛機位置。涵蓋範圍完整（包含過境、軍機等），但軌跡由點連線構成，降落過程細節較粗。與航線軌跡互補使用。", en: "Full-coverage airspace scan across East Asia — primarily sourced from OpenSky Network, continuously tracking all aircraft in the region. Broader coverage (including overflights, military, etc.) but trails are point-connected and less detailed during descent. Complementary to Route Tracks." },
      color: "#1ad9e5",
    },
    {
      name: { zh: "OpenStreetMap", en: "OpenStreetMap" },
      source: "OSM Overpass API",
      desc: { zh: "機場邊界多邊形 — 透過 Overpass API 擷取台灣、日本、香港等地機場的建築與跑道邊界，用於地圖上的機場區域渲染與光暈效果。", en: "Airport boundary polygons — retrieved via Overpass API for airports across Taiwan, Japan, Hong Kong, and more, used for airport area rendering and glow effects on the map." },
      color: "#66bb6a",
    },
    {
      name: { zh: "Mapbox GL JS", en: "Mapbox GL JS" },
      source: "Mapbox GL JS v3",
      desc: { zh: "向量地圖瓦片、3D 地形（terrain）、衛星影像。提供 6 種底圖樣式，支援 CustomLayer 嵌入 Three.js 場景。", en: "Vector map tiles, 3D terrain, satellite imagery. 6 map styles available, supports CustomLayer for embedding Three.js scenes." },
      color: "#ab47bc",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ fontSize: 13, lineHeight: 1.8, color: S.text, margin: "0 0 6px" }}>
        {L
          ? "本專案整合多個航空資料來源，所有資料經腳本擷取、轉換、過濾後呈現："
          : "This project integrates multiple aviation data sources, all processed through automated scripts:"}
      </p>
      {sources.map((s) => (
        <Card key={t(s.name, lang)} accentColor={s.color}>
          <div style={{ fontSize: 12, fontWeight: 600, color: S.text, marginBottom: 4 }}>{t(s.name, lang)}</div>
          <div style={{ fontSize: 11, color: S.active, marginBottom: 4 }}>{s.source}</div>
          <div style={{ fontSize: 12, color: S.sub, lineHeight: 1.7 }}>{t(s.desc, lang)}</div>
        </Card>
      ))}
    </div>
  );
}

/* ── About Page ── */

function AboutPage({ lang }: { lang: Lang }) {
  const L = lang === "zh";
  const stats = [
    { num: "10,000+", label: { zh: "航班", en: "Flights" } },
    { num: "95+", label: { zh: "機場", en: "Airports" } },
    { num: "275", label: { zh: "機場資料檔", en: "Airport Data Files" } },
    { num: "6", label: { zh: "底圖樣式", en: "Map Styles" } },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 style={{ fontSize: 18, color: S.text, margin: "0 0 10px", letterSpacing: 1 }}>Flight Arc</h2>
        <p style={{ fontSize: 13, lineHeight: 1.9, color: S.text, margin: 0 }}>
          {L
            ? "航班軌跡生成式藝術視覺化。以東亞機場為中心，涵蓋台灣、日本、香港及更多地區，將航班起降軌跡轉化為光軌藝術作品。"
            : "Generative art visualization of flight trajectories. Centered on East Asian airports including Taiwan, Japan, Hong Kong, and beyond, transforming flight paths into luminous arc artworks."}
        </p>
      </div>

      <SectionTitle>{L ? "規模" : "SCALE"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
        {stats.map((item) => (
          <div key={t(item.label, lang)} style={{
            background: S.cardBg, border: `1px solid ${S.cardBorder}`, borderRadius: 8,
            padding: "12px 14px", textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: S.active }}>{item.num}</div>
            <div style={{ fontSize: 11, color: S.sub, marginTop: 2 }}>{t(item.label, lang)}</div>
          </div>
        ))}
      </div>

      <SectionTitle>{L ? "技術堆疊" : "TECH STACK"}</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["React 19", "TypeScript", "Vite", "Mapbox GL JS v3", "Three.js r172", "GLSL Shaders", "WebGL", "Docker", "AWS S3"].map((x) => (
          <Tag key={x}>{x}</Tag>
        ))}
      </div>

      <SectionTitle>{L ? "資料來源" : "DATA SOURCES"}</SectionTitle>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["FR24", "ADS-B/OpenSky", "OpenStreetMap", "Mapbox"].map((x) => (
          <Tag key={x}>{x}</Tag>
        ))}
      </div>

      <SectionTitle>{L ? "架構亮點" : "ARCHITECTURE"}</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Card title="Three.js CustomLayer">
          {L
            ? "透過 Mapbox CustomLayer 嵌入 Three.js 場景，在同一個 WebGL context 中渲染 3D 航班弧線、光球、光軌動畫。"
            : "Three.js scenes embedded in Mapbox via CustomLayer sharing the same WebGL context, rendering 3D flight arcs, orbs, and trail animations."}
        </Card>
        <Card title="Multi-Source Data Fusion">
          {L
            ? "FR24 API 完整軌跡 + ADS-B 快照融合，多源資料交叉比對，提供更完整的空域覆蓋。"
            : "FR24 API full trajectories + ADS-B snapshot fusion, cross-referencing multiple sources for more comprehensive airspace coverage."}
        </Card>
        <Card title="Flight Stats Engine">
          {L
            ? "即時統計計算引擎 — 航班數、航線排名、機型分佈、航空公司統計、飛行時長分析，支援按機場 / 全區域維度切換。"
            : "Real-time statistics engine — flight counts, route rankings, aircraft type distribution, airline stats, duration analysis, supporting per-airport and all-region views."}
        </Card>
      </div>
    </div>
  );
}

/* ── Profile Page ── */

function ProjectCard({ name, desc, screenshot, site, github }: {
  name: string; desc: string; screenshot?: string; site?: string; github: string;
}) {
  return (
    <div style={{
      background: S.cardBg, border: `1px solid ${S.cardBorder}`, borderRadius: 8,
      overflow: "hidden",
    }}>
      {screenshot && (
        <div style={{ width: "100%", height: 120, overflow: "hidden" }}>
          <img src={screenshot} alt={name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
      <div style={{ padding: "10px 14px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: S.text, marginBottom: 4 }}>{name}</div>
        <div style={{ fontSize: 11, color: S.sub, marginBottom: 8, lineHeight: 1.5 }}>{desc}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {site && (
            <a href={site} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: S.active, textDecoration: "none" }}>
              Live
            </a>
          )}
          <a href={github} target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 11, color: S.sub, textDecoration: "none" }}>
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ lang }: { lang: Lang }) {
  const L = lang === "zh";

  const projects = [
    {
      name: L ? "Mini-Taiwan 軌道運輸模擬" : "Mini-Taiwan Rail Simulation",
      desc: L ? "台灣軌道運輸即時模擬視覺化" : "Real-time Taiwan rail transit simulation",
      screenshot: "./screenshots/mini-taiwan.png",
      site: "https://mini-taiwan-learning-project.zeabur.app/",
      github: "https://github.com/ianlkl11234s/mini-taiwan-learning-project",
    },
    {
      name: "Taiwan Flight Arc",
      desc: L ? "台灣航班弧線 3D 視覺化" : "Taiwan flight arc 3D visualization",
      screenshot: "./screenshots/taiwan-flight-arc.png",
      site: "https://flight-arc.zeabur.app/",
      github: "https://github.com/ianlkl11234s/flight-arc-graph",
    },
    {
      name: L ? "Taiwan Weather Timelapse 台灣氣象模擬" : "Taiwan Weather Timelapse",
      desc: L ? "台灣氣象時序動畫視覺化" : "Taiwan weather time-series animation",
      screenshot: "./screenshots/weather.png",
      site: "https://taiwan-weather-timelapse.zeabur.app/",
      github: "https://github.com/ianlkl11234s/taiwan-weather-timelapse",
    },
    {
      name: "Mini Taiwan Pulse",
      desc: L ? "台灣交通與基礎設施多圖層即時視覺化 — 航班、船舶、鐵道、車站、燈塔、風場等" : "Multi-layer real-time visualization of Taiwan's transport & infrastructure — flights, ships, rail, stations, lighthouses, wind farms",
      screenshot: "./screenshots/all-layers-facilities.png",
      site: "https://mini-taiwan-pulse.zeabur.app/",
      github: "https://github.com/ianlkl11234s/mini-taiwan-pulse",
    },
    {
      name: L ? "Ship GIS — 台灣海域船舶動態" : "Ship GIS — Taiwan Maritime Viz",
      desc: L ? "台灣海域船舶動態視覺化平台" : "Taiwan maritime vessel visualization platform",
      github: "https://github.com/ianlkl11234s/tw-ship-viz",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Avatar + Name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <img src="./screenshots/頭貼.jpg" alt="Migu"
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: S.text }}>Migu</div>
          <div style={{ fontSize: 12, color: S.sub }}>Senior Data Analyst / GIS</div>
        </div>
      </div>

      {/* 社群連結 */}
      <SectionTitle>{L ? "社群連結" : "SOCIAL LINKS"}</SectionTitle>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <a href="https://github.com/ianlkl11234s" target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: S.cardBg, border: `1px solid ${S.cardBorder}`, borderRadius: 8, textDecoration: "none", color: S.text, fontSize: 12 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          GitHub
        </a>
        <a href="https://www.threads.com/@ianlkl1314" target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: S.cardBg, border: `1px solid ${S.cardBorder}`, borderRadius: 8, textDecoration: "none", color: S.text, fontSize: 12 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.784 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.346-.789-.96-1.42-1.744-1.838.164 3.1-1.063 5.453-3.693 5.453-1.602 0-2.97-.767-3.652-2.048-.585-1.098-.63-2.545.013-3.878.926-1.916 3.083-2.878 5.29-2.472.1-.612.133-1.266.08-1.952l2.036-.244c.083.87.06 1.693-.06 2.455 1.038.497 1.892 1.2 2.494 2.1.864 1.29 1.196 2.86.96 4.539-.32 2.28-1.462 4.1-3.298 5.272C15.692 23.347 13.718 24 12.186 24zm.512-7.17c.828 0 1.474-.31 1.858-.892.532-.806.56-2.04-.02-2.834-.328-.21-.702-.382-1.126-.506-.078 1.072-.29 2.089-.648 2.983-.137.343-.5 1.25.064 1.25h-.128z"/></svg>
          Threads
        </a>
      </div>

      {/* 其他專案 */}
      <SectionTitle>{L ? "其他專案" : "OTHER PROJECTS"}</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {projects.map((p) => (
          <ProjectCard key={p.github} {...p} />
        ))}
      </div>
    </div>
  );
}

/* ── Tips Page ── */

function TipsPage({ lang }: { lang: Lang }) {
  const L = lang === "zh";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <p style={{ fontSize: 13, lineHeight: 1.8, color: S.text, margin: 0 }}>
        {L ? "以下是一些實用的操作技巧，幫助你更好地探索東亞的空中交通：" : "Here are some useful tips to help you explore East Asia's air traffic:"}
      </p>
      {TIPS_BY_CATEGORY.map((group) => (
        <div key={group.cat}>
          <SectionTitle>{group.cat}</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {group.tips.map((tip, i) => (
              <Card key={i}>
                <span style={{ color: S.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{tip}</span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 頁面標題 ── */
const PAGE_TITLES: Record<string, Record<Lang, string>> = {
  "getting-started": { zh: "操作指南", en: "Getting Started" },
  "feature-legend": { zh: "功能圖例", en: "Feature Legend" },
  "data-sources": { zh: "資料來源", en: "Data Sources" },
  tips: { zh: "使用技巧", en: "Tips" },
  about: { zh: "關於專案", en: "About" },
  profile: { zh: "個人介紹", en: "Profile" },
};

/* ── 主元件 ── */

export function InfoModal({ open, onClose, isMobile }: InfoModalProps) {
  const [activeTab, setActiveTab] = useState<BottomTab>("guide");
  const [guidePage, setGuidePage] = useState<GuidePage>("getting-started");
  const [lang, setLang] = useState<Lang>("zh");

  if (!open) return null;

  const currentPageKey = activeTab === "guide" ? guidePage : activeTab;
  const title = PAGE_TITLES[currentPageKey]?.[lang] ?? "";

  const guideSubNav: { key: GuidePage; label: Record<Lang, string> }[] = [
    { key: "getting-started", label: { zh: "操作指南", en: "Getting Started" } },
    { key: "feature-legend", label: { zh: "功能圖例", en: "Feature Legend" } },
    { key: "data-sources", label: { zh: "資料來源", en: "Data Sources" } },
    { key: "tips", label: { zh: "使用技巧", en: "Tips" } },
  ];

  const bottomTabs: { key: BottomTab; label: Record<Lang, string> }[] = [
    { key: "guide", label: { zh: "指南", en: "Guide" } },
    { key: "about", label: { zh: "關於", en: "About" } },
    { key: "profile", label: { zh: "個人", en: "Profile" } },
  ];

  function renderContent() {
    if (activeTab === "guide") {
      switch (guidePage) {
        case "getting-started": return <GettingStartedPage lang={lang} />;
        case "feature-legend": return <FeatureLegendPage lang={lang} />;
        case "data-sources": return <DataSourcesPage lang={lang} />;
        case "tips": return <TipsPage lang={lang} />;
      }
    }
    if (activeTab === "about") return <AboutPage lang={lang} />;
    if (activeTab === "profile") return <ProfilePage lang={lang} />;
    return null;
  }

  function renderSidebar() {
    return (
      <div style={{
        width: 200, flexShrink: 0,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        borderRight: `1px solid ${S.border}`,
        padding: "20px 0",
      }}>
        <div style={{ padding: "0 16px" }}>
          <div style={{ fontSize: 11, color: S.label, letterSpacing: 1.5, marginBottom: 14, textTransform: "uppercase" }}>
            {lang === "zh" ? "使用指南" : "User Guide"}
          </div>
          {activeTab === "guide" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {guideSubNav.map((item) => (
                <button key={item.key} onClick={() => setGuidePage(item.key)}
                  style={{
                    background: guidePage === item.key ? "rgba(100,170,255,0.12)" : "transparent",
                    border: "none", borderRadius: 6, padding: "8px 12px", textAlign: "left",
                    color: guidePage === item.key ? S.active : S.sub,
                    fontSize: 12, fontFamily: S.font, cursor: "pointer", transition: "all 0.15s",
                  }}>
                  {item.label[lang]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
          {bottomTabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                background: activeTab === tab.key ? "rgba(100,170,255,0.12)" : "transparent",
                border: "none", borderRadius: 6, padding: "8px 12px", textAlign: "left",
                color: activeTab === tab.key ? S.active : S.sub,
                fontSize: 12, fontFamily: S.font, cursor: "pointer",
                fontWeight: activeTab === tab.key ? 600 : 400, transition: "all 0.15s",
              }}>
              {tab.label[lang]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderMobileNav() {
    return (
      <div style={{ borderBottom: `1px solid ${S.border}`, padding: "12px 16px 0" }}>
        <div style={{ display: "flex", gap: 0 }}>
          {bottomTabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{
                flex: 1, background: "transparent", border: "none",
                borderBottom: activeTab === tab.key ? `2px solid ${S.active}` : "2px solid transparent",
                padding: "8px 0", color: activeTab === tab.key ? S.active : S.sub,
                fontSize: 12, fontFamily: S.font, cursor: "pointer",
                fontWeight: activeTab === tab.key ? 600 : 400,
              }}>
              {tab.label[lang]}
            </button>
          ))}
        </div>
        {activeTab === "guide" && (
          <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
            {guideSubNav.map((item) => (
              <button key={item.key} onClick={() => setGuidePage(item.key)}
                style={{
                  flex: 1, background: "transparent", border: "none",
                  borderBottom: guidePage === item.key ? `2px solid ${S.active}` : "2px solid transparent",
                  padding: "6px 0", color: guidePage === item.key ? S.active : S.sub,
                  fontSize: 11, fontFamily: S.font, cursor: "pointer",
                }}>
                {item.label[lang]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center", fontFamily: S.font,
        animation: "fadeIn 0.25s ease-out",
      }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: isMobile ? "100vw" : "min(920px, 92vw)",
          height: isMobile ? "92vh" : "min(680px, 88vh)",
          background: S.bg, backdropFilter: "blur(24px)",
          border: isMobile ? "none" : `1px solid ${S.border}`,
          borderRadius: isMobile ? "16px 16px 0 0" : 16,
          display: "flex", flexDirection: isMobile ? "column" : "row",
          overflow: "hidden", color: "#fff",
        }}>
        {isMobile ? renderMobileNav() : renderSidebar()}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isMobile ? "14px 16px" : "20px 28px",
            borderBottom: `1px solid ${S.border}`, flexShrink: 0,
          }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 18, letterSpacing: 1, color: S.text }}>{title}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${S.border}` }}>
                {(["zh", "en"] as Lang[]).map((l) => (
                  <button key={l} onClick={() => setLang(l)}
                    style={{
                      background: lang === l ? "rgba(100,170,255,0.15)" : "transparent",
                      border: "none", padding: "3px 10px",
                      color: lang === l ? S.active : S.sub,
                      fontSize: 11, fontFamily: S.font, cursor: "pointer",
                    }}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
              <button onClick={onClose}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)", border: "none", color: S.sub,
                  fontSize: 16, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                ✕
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px" : "24px 28px" }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
