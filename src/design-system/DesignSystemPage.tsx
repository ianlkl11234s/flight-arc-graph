import { useState } from "react";
import { COLOR, FONT, LAYOUT, SIZE, SPACE } from "../styles/tokens";
import { useTheme } from "../styles/ThemeContext";
import {
  Button,
  Caption,
  Chip,
  ChipGroup,
  DockCard,
  SelectionRing,
  Modal,
  Panel,
  PanelBody,
  PanelHeader,
  Section,
  Segmented,
  Select,
  Slider,
  StatCard,
  StatGrid,
  StatusBar,
  Toggle,
} from "../ui";
import { Showcase } from "./Showcase";
import { AirportColumnHeader, AirportRow, statColWidth, type AirportColumn } from "../components/sidebar/primitives";
import { nextSort, type AirportSort } from "../data/airportListStats";
import { BootScreen } from "../components/boot/BootScreen";
import { bootRadarPoints } from "../components/boot/radar";
import { BOOT_LAYOUT } from "../components/boot/bootLayout";

/* ── 共用示範資料（真實語境） ── */

type DepArr = "all" | "dep" | "arr";
const DEP_ARR = [
  { value: "all" as const, label: "全部" },
  { value: "dep" as const, label: "離場" },
  { value: "arr" as const, label: "進場" },
];

type Region = "TW" | "JP" | "KR" | "SEA" | "EU";
const REGIONS: { value: Region; label: string }[] = [
  { value: "TW", label: "臺灣" },
  { value: "JP", label: "日本" },
  { value: "KR", label: "韓國" },
  { value: "SEA", label: "東南亞" },
  { value: "EU", label: "歐洲" },
];

const SPEEDS = [1, 10, 30, 60, 120, 300].map((v) => ({ value: v, label: `${v}×` }));

const BASEMAPS = [
  { value: "dark", label: "夜間（Dark）" },
  { value: "light", label: "日間（Light）" },
  { value: "satellite", label: "衛星影像" },
  { value: "terrain", label: "地形" },
];

const hours = (v: number) => `${v}h`;

/* ── Icons for demo ── */

function IconPlay() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2 1.2v7.6L8.6 5z" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M6 1.5v6M3.5 5L6 7.5 8.5 5M2 10h8" />
    </svg>
  );
}

/* ── Demos ── */

function PanelDemo() {
  const [mode, setMode] = useState<DepArr>("all");
  const [regions, setRegions] = useState<Set<Region>>(new Set(["TW", "JP"]));
  const [scale, setScale] = useState(true);
  const [width, setWidth] = useState(1.4);
  return (
    <Panel floating={false} ariaLabel="機場面板">
      <PanelHeader eyebrow="SELECTION · 機場" title="臺灣桃園國際機場 RCTP" onClose={() => undefined} />
      <PanelBody>
        <Section title="MODE · 起降">
          <Segmented options={DEP_ARR} value={mode} onChange={setMode} fullWidth ariaLabel="起降篩選" />
        </Section>
        <Section title="REGION · 區域" badge={regions.size}>
          <ChipGroup
            options={REGIONS}
            selected={regions}
            onToggle={(r) =>
              setRegions((prev) => {
                const next = new Set(prev);
                if (next.has(r)) next.delete(r);
                else next.add(r);
                return next;
              })
            }
            ariaLabel="區域"
          />
        </Section>
        <Section title="STYLE · 樣式">
          <Toggle label="依機型縮放線寬" checked={scale} onChange={setScale} />
          <Slider label="線寬" min={0.2} max={4} step={0.1} value={width} onChange={setWidth} format={(v) => `${v.toFixed(1)} px`} />
        </Section>
        <Section title="SUMMARY · 2026-02-18">
          <StatGrid>
            <StatCard label="航班" value="1,284" sub="架次" />
            <StatCard label="航空公司" value="47" />
            <StatCard label="準點率" value={null} sub="未涵蓋" />
          </StatGrid>
        </Section>
      </PanelBody>
    </Panel>
  );
}

function SetsPanelDemo() {
  const [tab, setTab] = useState<"airports" | "sets" | "scenes">("airports");
  const [sort, setSort] = useState<AirportSort>({ key: "tot", dir: "desc" });
  // 2026-02-18 真實數字；NZAA 模擬舊 manifest（無進離欄）→ 「—」（R9）
  const rows = [
    { icao: "KATL", name: "亞特蘭大哈次菲爾德", tot: 1868, arr: 966 as number | null, dep: 904 as number | null },
    { icao: "KORD", name: "芝加哥歐海爾", tot: 1913, arr: 866, dep: 1047 },
    { icao: "RCTP", name: "臺灣桃園", tot: 651, arr: 352, dep: 299 },
    { icao: "NZAA", name: "奧克蘭", tot: 210, arr: null, dep: null },
  ].sort((a, b) => {
    const sign = sort.dir === "desc" ? 1 : -1;
    if (sort.key === "name") return -sign * a.name.localeCompare(b.name, "zh-Hant");
    const va = a[sort.key] ?? -1;
    const vb = b[sort.key] ?? -1;
    if ((va < 0) !== (vb < 0)) return va < 0 ? 1 : -1; // 缺值固定殿後
    return sign * (vb - va);
  });
  const colWidth = statColWidth(rows.flatMap((r) => [r.tot, r.arr, r.dep]));
  return (
    <Panel floating={false} ariaLabel="機場面板" width={tab === "airports" ? LAYOUT.panelWidthList : LAYOUT.panelWidth}>
      <PanelHeader eyebrow="SELECTION · 機場" title="2026-02-18" />
      <PanelBody>
        <Segmented
          fullWidth
          ariaLabel="機場面板分頁"
          options={[
            { value: "airports" as const, label: "機場" },
            { value: "sets" as const, label: "組合" },
            { value: "scenes" as const, label: "場景" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "airports" ? (
          <>
            <AirportColumnHeader
              sortKey={sort.key}
              sortDir={sort.dir}
              colWidth={colWidth}
              onSort={(k: AirportColumn) => setSort(nextSort(sort, k))}
            />
            <div>
              {rows.map((r) => (
                <AirportRow
                  key={r.icao}
                  icao={r.icao}
                  name={r.name}
                  current={r.icao === "KATL"}
                  inSet={false}
                  stats={{ tot: r.tot, arr: r.arr, dep: r.dep }}
                  colWidth={colWidth}
                  onOpen={() => undefined}
                  onToggleSet={() => undefined}
                />
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: SIZE.minor }}>
            {tab === "sets" ? "PRESETS · 預設組合與目前組合" : "SCENES · 場景預設"}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function PanelHeaderDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 288 }}>
      <Panel floating={false} ticks={false}>
        <PanelHeader eyebrow="ANALYSIS · 分析" title="航線深度分析" onClose={() => undefined} />
      </Panel>
      <Panel floating={false} ticks={false}>
        <PanelHeader
          eyebrow="SETS · 預設組合"
          title="亞太樞紐"
          actions={<Button variant="ghost" style={{ height: 24 }}>重設</Button>}
          onClose={() => undefined}
        />
      </Panel>
      <Panel floating={false} ticks={false}>
        <PanelHeader title="無眉標、不可關閉" />
      </Panel>
    </div>
  );
}

function SectionDemo() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ width: 264, display: "flex", flexDirection: "column", gap: SPACE.s12 }}>
      <Section title="FILTER · 篩選">
        <span>靜態區段，內容在下一行。</span>
      </Section>
      <Section
        title="AIRCRAFT · 機型"
        collapsible
        open={open}
        onToggle={setOpen}
        badge={3}
        right={<Button variant="ghost" style={{ height: 20, padding: `0 ${SPACE.s4}px`, fontSize: SIZE.minor }}>清除</Button>}
      >
        <span>受控收合 + 徽章 + 右側動作。</span>
      </Section>
      <Section title="DURATION · 飛行時間" collapsible defaultOpen={false}>
        <span>非受控、預設收起。</span>
      </Section>
    </div>
  );
}

function ButtonDemo() {
  const [playing, setPlaying] = useState(false);
  const [rec, setRec] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12 }}>
      <div style={{ display: "flex", gap: SPACE.s8, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" icon={<IconPlay />}>播放</Button>
        <Button icon={<IconDownload />}>匯出 4K</Button>
        <Button variant="ghost">重設視角</Button>
        <Button variant="danger">刪除關鍵影格</Button>
      </div>
      <div style={{ display: "flex", gap: SPACE.s8, flexWrap: "wrap", alignItems: "center" }}>
        <Button icon={<IconDownload />} ariaLabel="下載截圖" />
        <Button pressed={playing} onClick={() => setPlaying((p) => !p)} width={84}>
          {playing ? "暫停" : "播放"}
        </Button>
        <Button pressed={rec} onClick={() => setRec((p) => !p)} width={96}>
          {rec ? "停止錄影" : "開始錄影"}
        </Button>
        <Button disabled>無資料</Button>
      </div>
    </div>
  );
}

function SegmentedDemo() {
  const [mode, setMode] = useState<DepArr>("dep");
  const [dim, setDim] = useState<"2d" | "3d">("3d");
  const [src, setSrc] = useState<"api" | "fused">("api");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 264 }}>
      <Segmented options={DEP_ARR} value={mode} onChange={setMode} ariaLabel="起降" />
      <Segmented
        options={[
          { value: "2d", label: "2D" },
          { value: "3d", label: "3D" },
        ]}
        value={dim}
        onChange={setDim}
        ariaLabel="視角"
      />
      <Segmented
        options={[
          { value: "api", label: "航班 API" },
          { value: "fused", label: "融合資料" },
        ]}
        value={src}
        onChange={setSrc}
        disabledValues={new Set(["fused" as const])}
        fullWidth
        ariaLabel="資料來源"
      />
    </div>
  );
}

function SelectDemo() {
  const [basemap, setBasemap] = useState("dark");
  const [speed, setSpeed] = useState(60);
  const [flight, setFlight] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 264 }}>
      <Select label="底圖" options={BASEMAPS} value={basemap} onChange={setBasemap} />
      <Select label="播放速度" options={SPEEDS} value={speed} onChange={setSpeed} width={96} />
      <Select
        ariaLabel="選擇航班"
        placeholder="— 選擇航班 —"
        options={[
          { value: "CI0104", label: "CI0104 RCTP → RJTT" },
          { value: "BR0198", label: "BR0198 RCTP → RJAA" },
          { value: "JX0800", label: "JX0800 RCTP → RJBB" },
          { value: "IT0216", label: "IT0216 RCTP → RJFF" },
        ]}
        value={flight}
        onChange={setFlight}
        fullWidth
      />
      <Select label="區域" options={REGIONS} value="TW" onChange={() => undefined} disabled />
    </div>
  );
}

function ToggleDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 264 }}>
      <Toggle label="依機型縮放" checked={a} onChange={setA} />
      <Toggle label="顯示晨昏線" description="依 2026-02-18 UTC+8 時刻計算" checked={b} onChange={setB} />
      <Toggle label="空域極光（無資料）" checked={false} onChange={() => undefined} disabled />
      <div style={{ display: "flex", gap: SPACE.s8, alignItems: "center" }}>
        <Toggle ariaLabel="循環播放" checked={c} onChange={setC} />
        <span>無標籤（須給 ariaLabel）</span>
      </div>
    </div>
  );
}

function SliderDemo() {
  const [alt, setAlt] = useState(3000);
  const [dur, setDur] = useState<[number, number]>([1.5, 6]);
  const [t, setT] = useState(14 * 60 + 25);
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s16, width: 264 }}>
      <Slider label="高度上限" min={0} max={13000} step={100} value={alt} onChange={setAlt} format={(v) => `${v.toLocaleString()} m`} />
      <Slider range label="飛行時間" min={0} max={24} step={0.5} value={dur} onChange={setDur} format={hours} />
      <Slider label="時刻" min={0} max={1439} value={t} onChange={setT} format={clock} />
      <Slider label="光球大小（停用）" min={0} max={10} value={4} onChange={() => undefined} disabled />
    </div>
  );
}

function ChipDemo() {
  const [sel, setSel] = useState<Set<Region>>(new Set(["TW"]));
  const [recent, setRecent] = useState(["RCTP", "RJTT", "RKSI", "VTBS"]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 264 }}>
      <ChipGroup
        options={REGIONS}
        selected={sel}
        onToggle={(r) =>
          setSel((prev) => {
            const next = new Set(prev);
            if (next.has(r)) next.delete(r);
            else next.add(r);
            return next;
          })
        }
        ariaLabel="區域"
      />
      <div style={{ display: "flex", gap: SPACE.s6, flexWrap: "wrap" }}>
        {recent.map((c) => (
          <Chip key={c} label={c} onRemove={() => setRecent((r) => r.filter((x) => x !== c))} />
        ))}
        {recent.length === 0 && <span>（最近瀏覽已清空）</span>}
      </div>
      <div style={{ display: "flex", gap: SPACE.s6, flexWrap: "wrap" }}>
        <Chip label="RCTP" selected onClick={() => undefined} onRemove={() => undefined} />
        <Chip label="靜態標籤" mono={false} />
      </div>
    </div>
  );
}

function StatDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, width: 288 }}>
      <StatGrid>
        <StatCard label="離場" value="642" sub="架次" />
        <StatCard label="進場" value="638" sub="架次" />
        <StatCard label="平均航程" value="2.4h" sub="中位 1.9h" />
      </StatGrid>
      <StatGrid columns={2}>
        <StatCard label="目前時刻" value="14:25" emphasis sub="UTC+8" />
        <StatCard label="延誤" value={undefined} sub="未涵蓋" />
      </StatGrid>
      <div>
        <StatCard layout="row" label="航空公司" value={47} />
        <StatCard layout="row" label="最忙時段" value="08:00" sub="112 班" />
        <StatCard layout="row" label="準點率" value={null} />
      </div>
    </div>
  );
}

function SelectionRingDemo() {
  const { tokens } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.s16 }}>
      <div style={{ position: "relative", width: 120, height: 72, background: tokens.mapBg, border: `1px dashed ${tokens.border}` }}>
        <SelectionRing x={60} y={36} />
      </div>
      <SelectionRing x={0} y={0} floating={false} size={20} />
    </div>
  );
}

function DockDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s8 }}>
      <DockCard
        eyebrow="FLIGHT · 航班"
        title="CI0104"
        subtitle="RCTP → RJTT"
        kv={[
          { label: "機型", value: "A333" },
          { label: "起飛", value: "2026-02-18 08:05" },
          { label: "降落", value: "12:15 (UTC+8)" },
          { label: "巡航高度", value: "11,582 m" },
          { label: "登記", value: null },
        ]}
        actions={
          <>
            <Button variant="primary">追蹤此班</Button>
            <Button variant="ghost">飛過去</Button>
          </>
        }
        onClose={() => undefined}
      />
      <DockCard eyebrow="AIRSPACE · 空域" title="台北飛航情報區" subtitle="FIR" onClose={() => undefined}>
        <span>點擊處下方共 3 個空域，依範圍由小到大排列。</span>
      </DockCard>
    </div>
  );
}

function CaptionDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s24 }}>
      <Caption
        code="RCTP"
        name="臺灣桃園國際機場"
        meta={[
          { label: "2026-02-18 週三 · 台灣時間" },
          { value: "597", unit: "班" },
          { label: "進場", value: "303" },
          { label: "離場", value: "294" },
        ]}
        actions={
          <>
            <Button>選機場</Button>
            <Button>全部機場</Button>
          </>
        }
      />
      <Caption
        code="亞太樞紐"
        name="6 座機場"
        meta={[{ label: "2026-02-19 週四 · 台灣時間" }, { value: "0", unit: "班" }]}
        notice="此日期範圍無航班資料"
        onExit={() => undefined}
        exitLabel="退出組合模式"
      />
    </div>
  );
}

function StatusDemo() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s8, width: 300 }}>
      <StatusBar state="loading" message="載入 RCTP · 2026-02-18" detail="3 / 7 檔" progress={0.42} />
      <StatusBar state="done" message="已載入 1,284 班" detail="RCTP" />
      <StatusBar state="empty" message="2026-02-19 這天沒有軌跡資料" />
      <StatusBar
        state="error"
        message="載入失敗：網路逾時"
        action={<Button variant="ghost" style={{ height: 20, padding: `0 ${SPACE.s6}px` }}>重試</Button>}
      />
    </div>
  );
}

function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s12, alignItems: "flex-start" }}>
      <Modal
        inline
        open
        onClose={() => undefined}
        eyebrow="HELP · 說明"
        title="使用技巧"
        width={360}
        footer={<Button variant="primary">知道了</Button>}
      >
        拖曳時間軸可跳到任一時刻；按 Esc 依序關閉說明視窗、資訊卡、單航班模式與面板。
      </Modal>
      <Button onClick={() => setOpen(true)}>開啟真的 Modal（Esc 關閉）</Button>
      <Modal open={open} onClose={() => setOpen(false)} eyebrow="ABOUT · 關於" title="Flight Arc">
        以 FR24 軌跡資料重建 2026-02-18 臺灣起降航班的 3D 弧線。
      </Modal>
    </div>
  );
}

function TokenSwatches() {
  const { tokens } = useTheme();
  const keys = Object.keys(tokens) as (keyof typeof tokens)[];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: SPACE.s6, width: "100%" }}>
      {keys.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: SPACE.s8, fontFamily: FONT.data, fontSize: SIZE.minor }}>
          <span style={{ width: 28, height: 16, background: tokens[k], border: `1px solid ${tokens.border}`, flex: "none" }} />
          <span>{k}</span>
          <span style={{ color: tokens.fg3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tokens[k]}</span>
        </div>
      ))}
    </div>
  );
}

function BootDemo() {
  const { tokens } = useTheme();
  // 同步可得的 camera preset 座標（真實機場）；正式站另會用機場目錄
  const points = bootRadarPoints("RCTP", {}, BOOT_LAYOUT.radiusKm);
  return (
    <div style={{ position: "relative", width: 420, height: 300, border: `1px solid ${tokens.border}`, overflow: "hidden" }}>
      <BootScreen contained phase="loading" label="RCTP" points={points} />
    </div>
  );
}

/* ── Page ── */

const SECTIONS = [
  { id: "tokens", name: "Color tokens", note: "useTheme().tokens 的全部色票（含 P2 補的 danger / rec / accentSoft）。", render: () => <TokenSwatches /> },
  { id: "panel", name: "Panel", note: "左浮動面板外殼（288 寬，對角琥珀刻度）。這裡 floating={false} 以流式排版展示；實際使用預設定位在 left 64 / top 52。", render: () => <PanelDemo /> },
  { id: "panel-header", name: "PanelHeader", note: "眉標 + 14px 標題 + 24×24 SVG 關閉鈕；actions 放在關閉鈕左側。", render: () => <PanelHeaderDemo /> },
  { id: "section", name: "Section", note: "眉標 + 右延細線。collapsible 支援受控（open/onToggle）與非受控（defaultOpen）。", render: () => <SectionDemo /> },
  { id: "button", name: "Button", note: "高 28：primary / secondary / ghost / danger；pressed 輸出 aria-pressed；會換字的按鈕給固定 width（R10）。", render: () => <ButtonDemo /> },
  { id: "segmented", name: "Segmented", note: "選項 ≤3。選中 = accent 字 + accentSoft 底。disabledValues 相容 ToggleButtons。", render: () => <SegmentedDemo /> },
  { id: "sets-panel", name: "機場面板（三分頁＋數字欄）", note: "Segmented 三分頁：機場｜組合｜場景。機場列右側兩欄數字：進場（TRAJ 進場色）、離場（TRAJ 離場色），欄首「進」「離」；缺值顯示「—」（R9，NZAA 範例）。排序列：總量／進場／離場／名稱。", render: () => <SetsPanelDemo /> },
  { id: "select", name: "Select", note: "選項 >3。原生 select + SVG chevron；支援數字值、placeholder、行內標籤。", render: () => <SelectDemo /> },
  { id: "toggle", name: "Toggle", note: "28×16 方角開關，開 = accent 底。", render: () => <ToggleDemo /> },
  { id: "slider", name: "Slider", note: "全站唯一滑桿：2px 軌 + 6×14 方形 thumb；標籤與數值同一行。range 模式為雙把手（取代 DurationRange）。", render: () => <SliderDemo /> },
  { id: "chip", name: "Chip / ChipGroup", note: "篩選與最近瀏覽。選中 = accent 邊框；移除鈕為 SVG。ChipGroup 為多選集合。", render: () => <ChipDemo /> },
  { id: "stat", name: "StatCard", note: "card / row 兩種版型；數字一律 mono tabular；缺值顯示「—」（R9）。", render: () => <StatDemo /> },
  { id: "dock", name: "DockCard", note: "右下 dock 資訊卡外殼：眉標、標題、kv 列、動作列、關閉。", render: () => <DockDemo /> },
  { id: "selection-ring", name: "SelectionRing", note: "點擊處的選取圈（R1）：固定在點擊位置，不吃滑鼠；相機移動或卡片關閉時由呼叫端移除。", render: () => <SelectionRingDemo /> },
  { id: "caption", name: "Caption", note: "左下圖說：機場碼 30px mono + 中文名、日期／班數／進離場；左側 2px 琥珀線。組合模式含退出鈕；面板收起時旁邊放引導入口（Q6）。", render: () => <CaptionDemo /> },
  { id: "status", name: "StatusBar", note: "單行載入狀態（外觀）。失敗與「這天沒資料」分開；顯示節奏（150ms / 600ms / 2s / 4s）P4 接。", render: () => <StatusDemo /> },
  { id: "boot", name: "BootScreen", note: "開場雷達遮罩（contained 預覽）：環、掃描、RCTP 周邊真實機場點、字標與狀態 chip。尺寸參數在 bootLayout.ts；完整時序與參數調整見 /boot-tuner.html。", render: () => <BootDemo /> },
  { id: "modal", name: "Modal", note: "置中外殼、z modal、Esc 關閉（capture 階段攔截，R7 最上層）。上方為 inline 展示。", render: () => <ModalDemo /> },
];

export function DesignSystemPage() {
  const t = COLOR.dark;
  return (
    <div style={{ background: t.mapBg, color: t.fg1, fontFamily: FONT.ui, minHeight: "100vh", padding: `${SPACE.s24}px ${SPACE.s24 + SPACE.s8}px` }}>
      <header style={{ marginBottom: SPACE.s24 }}>
        <div style={{ fontFamily: FONT.data, fontSize: SIZE.eyebrow, letterSpacing: ".18em", color: t.fg3 }}>FLIGHT ARC · STUDIO</div>
        <h1 style={{ fontSize: SIZE.large, fontWeight: 500, margin: `${SPACE.s4}px 0 ${SPACE.s8}px` }}>Design System · 活元件頁</h1>
        <p style={{ fontSize: SIZE.body, color: t.fg2, margin: 0 }}>
          src/ui 真元件，暗／淡並排。規格：docs/design-system/spec.md。新增元件必須同時加一段。
        </p>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s12, marginTop: SPACE.s12, fontFamily: FONT.data, fontSize: SIZE.minor }}>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} style={{ color: t.fg2 }}>
              {s.name}
            </a>
          ))}
        </nav>
      </header>
      {SECTIONS.map((s) => (
        <Showcase key={s.id} id={s.id} name={s.name} note={s.note} render={s.render} />
      ))}
    </div>
  );
}
