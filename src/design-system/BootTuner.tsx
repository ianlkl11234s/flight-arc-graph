import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BootScreen } from "../components/boot/BootScreen";
import {
  BOOT_LAYOUT,
  BOOT_LAYOUT_FIELDS,
  formatBootLayoutTs,
  sanitizeBootLayout,
  type BootLayout,
} from "../components/boot/bootLayout";
import {
  bootAttrFor,
  bootMaskVisible,
  initBoot,
  setBootAttr,
  setBootScale,
  stepBoot,
  type BootPhase,
  type BootState,
} from "../components/boot/bootSequence";
import { bootRadarPoints, type RadarPoint } from "../components/boot/radar";
import { prefersReducedMotion } from "../components/boot/useBootPhase";
import { loadAirportMeta } from "../data/airportMeta";
import { ThemeProvider, useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, LAYOUT, RADIUS, SIZE, SPACE } from "../styles/tokens";
import { Button, Segmented, Slider, Toggle } from "../ui";
import { mix } from "../ui/vars";

/**
 * 開場雷達調整頁（dev only：/design-tools/boot-tuner.html，不進正式 build）。
 * 左：真的 BootScreen 預覽（桌機 16:9／手機 390×844）；右：每個 bootLayout 參數一個滑桿。
 * 調好按「複製設定」→ 貼回對話，由我們更新 src/components/boot/bootLayout.ts 的 BOOT_LAYOUT。
 * 調整中的值存 localStorage（只屬於本頁；正式站只讀 bootLayout.ts 預設值）。
 */

const STORAGE_KEY = "flight-arc:boot-tuner:v1";
const CENTER_ICAO = "RCTP";

type FrameKind = "desktop" | "mobile";
const FRAMES: Record<FrameKind, { w: number; h: number }> = {
  desktop: { w: 1440, h: 810 },
  mobile: { w: 390, h: 844 },
};

function readStored(): BootLayout {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizeBootLayout(JSON.parse(raw)) : { ...BOOT_LAYOUT };
  } catch {
    return { ...BOOT_LAYOUT };
  }
}

function writeStored(layout: BootLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // 私密視窗／封鎖儲存：只是不保留，照常可用
  }
}

const fmtNum = (v: number) => String(+v.toFixed(4));

/** 預覽框內的簡化主畫面（只示意彈入；用真的 boot.css 規則，靠 data-boot-part） */
function MockChrome({ kind }: { kind: FrameKind }) {
  const { tokens } = useTheme();
  const block: CSSProperties = {
    position: "absolute",
    background: tokens.panel,
    border: `1px solid ${tokens.border}`,
    borderRadius: RADIUS.base,
    backdropFilter: `blur(${BLUR}px)`,
  };
  const label: CSSProperties = { fontFamily: FONT.data, fontSize: SIZE.eyebrow, color: tokens.fg3, letterSpacing: ".18em" };
  if (kind === "mobile") {
    return (
      <>
        <div data-boot-part="toolbar" style={{ ...block, left: 0, right: 0, top: 0, height: 44, borderRadius: 0, display: "flex", alignItems: "center", padding: `0 ${SPACE.s12}px` }}>
          <span style={label}>RCTP · 工具列</span>
        </div>
        <div data-boot-part="toolbar" style={{ ...block, left: SPACE.s12, right: SPACE.s12, top: 52, height: 120, display: "flex", alignItems: "center", padding: `0 ${SPACE.s12}px` }}>
          <span style={label}>時間軸</span>
        </div>
        <div data-boot-part="fade" style={{ ...block, left: 0, right: 0, bottom: 0, height: 40, borderRadius: 0 }} />
      </>
    );
  }
  return (
    <>
      <div data-boot-part="rail" style={{ position: "absolute", left: 0, top: 0, width: LAYOUT.railWidth, background: tokens.rail, borderRight: `1px solid ${tokens.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: SPACE.s16, padding: `${SPACE.s24}px 0` }}>
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} style={{ display: "block", width: 16, height: i === 1 ? 1 : 16, border: i === 1 ? "none" : `1.3px solid ${i === 0 ? tokens.fg1 : tokens.fg3}`, background: i === 1 ? tokens.border : "transparent", borderRadius: RADIUS.base }} />
        ))}
      </div>
      <div data-boot-part="title" style={{ position: "absolute", left: LAYOUT.panelLeft + SPACE.s8, top: SPACE.s16, fontFamily: FONT.data, fontSize: SIZE.large, fontWeight: 700, letterSpacing: ".18em", color: tokens.fg1 }}>
        FLIGHT ARC
      </div>
      <div data-boot-part="toolbar" style={{ ...block, right: SPACE.s16, top: SPACE.s16, width: 620, height: 34, display: "flex", alignItems: "center", padding: `0 ${SPACE.s12}px` }}>
        <span style={label}>TOOLBAR · 工具列</span>
      </div>
      <div style={{ position: "absolute", left: LAYOUT.panelLeft + SPACE.s8, bottom: LAYOUT.mapBottomInset, display: "flex", flexDirection: "column", gap: SPACE.s12 }}>
        <div data-boot-part="caption" style={{ borderLeft: `2px solid ${tokens.accent}`, paddingLeft: SPACE.s8 + 1 }}>
          <div style={{ fontFamily: FONT.data, fontSize: SIZE.caption, color: tokens.fg1, lineHeight: 1.1 }}>RCTP</div>
          <div style={{ ...label, letterSpacing: ".04em" }}>2026-02-18 週三 · 台灣時間</div>
        </div>
        <div data-boot-part="timeline">
          <div style={{ ...block, position: "relative", width: 300, height: 40, display: "flex", alignItems: "center", gap: SPACE.s8, padding: `0 ${SPACE.s8}px` }}>
            <i style={{ display: "block", width: 22, height: 22, background: tokens.accent, borderRadius: RADIUS.base }} />
            <span style={{ fontFamily: FONT.data, fontSize: SIZE.sub, color: tokens.fg1 }}>07:35</span>
            <u style={{ flex: 1, height: 2, background: mix(tokens.fg1, 15) }} />
          </div>
        </div>
      </div>
    </>
  );
}

/** 依預覽區大小把固定尺寸的框等比縮進去 */
function useFitScale(frame: { w: number; h: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const fit = () => setScale(Math.max(0.05, Math.min(el.clientWidth / frame.w, el.clientHeight / frame.h)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame.w, frame.h]);
  return { hostRef, scale };
}

function TunerBody({ isDark, onDarkChange }: { isDark: boolean; onDarkChange: (v: boolean) => void }) {
  const { tokens } = useTheme();
  const [layout, setLayout] = useState<BootLayout>(readStored);
  const [frameKind, setFrameKind] = useState<FrameKind>("desktop");
  const [hold, setHold] = useState(true);
  const [boot, setBoot] = useState<BootState | null>(null);
  const [tick, setTick] = useState(0);
  const [points, setPoints] = useState<RadarPoint[]>(() => bootRadarPoints(CENTER_ICAO, {}, layout.radiusKm));
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof loadAirportMeta>>>({});
  const [copyState, setCopyState] = useState<"idle" | "copied" | "selected">("idle");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    loadAirportMeta().then(setMeta);
  }, []);
  useEffect(() => {
    setPoints(bootRadarPoints(CENTER_ICAO, meta, layout.radiusKm));
  }, [meta, layout.radiusKm]);
  useEffect(() => writeStored(layout), [layout]);

  // 重播：用真的狀態機（地圖與資料視為已就緒，所以時長＝最少顯示時間）
  useEffect(() => {
    if (!boot) return;
    const step = stepBoot(boot, { mapReady: true, dataSettled: true }, performance.now(), {
      minShowMs: layout.minShowMs,
      enterScale: layout.enterScale,
      reducedMotion: reduced,
    });
    if (step.state !== boot) {
      setBoot(step.state);
      return;
    }
    if (step.wakeInMs === null) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), step.wakeInMs + 1);
    return () => window.clearTimeout(id);
  }, [boot, tick, layout.minShowMs, layout.enterScale, reduced]);

  const phase: BootPhase = hold ? "loading" : boot?.phase ?? "gone";
  useEffect(() => {
    setBootAttr(bootAttrFor(phase));
  }, [phase]);
  useEffect(() => {
    setBootScale(layout.enterScale);
  }, [layout.enterScale]);
  useEffect(() => () => setBootAttr(null), []);

  const replay = () => {
    setHold(false);
    setBootAttr("wait");
    setBoot(initBoot(performance.now()));
  };

  const tsText = formatBootLayoutTs(layout);
  const copy = () => {
    // clipboard 必須在 click handler 內同步呼叫；失敗改成選取文字讓使用者手動複製
    const selectText = () => {
      textRef.current?.focus();
      textRef.current?.select();
      setCopyState("selected");
    };
    try {
      navigator.clipboard.writeText(tsText).then(() => setCopyState("copied"), selectText);
    } catch {
      selectText();
    }
  };
  useEffect(() => {
    if (copyState === "idle") return;
    const id = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(id);
  }, [copyState]);

  const frame = FRAMES[frameKind];
  const { hostRef, scale } = useFitScale(frame);
  const set = (key: keyof BootLayout, v: number) => setLayout((prev) => ({ ...prev, [key]: v }));

  const eyebrow: CSSProperties = { fontFamily: FONT.data, fontSize: SIZE.eyebrow, letterSpacing: ".18em", color: tokens.fg3 };

  return (
    <div style={{ display: "flex", height: "100vh", background: tokens.mapBg, color: tokens.fg1, fontFamily: FONT.ui, fontSize: SIZE.body }}>
      {/* ── 預覽 ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: SPACE.s12, padding: SPACE.s16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.s12, flexWrap: "wrap" }}>
          <span style={eyebrow}>BOOT TUNER · 開場調整</span>
          <Segmented<FrameKind>
            ariaLabel="預覽框"
            options={[
              { value: "desktop", label: "桌機 16:9" },
              { value: "mobile", label: "手機 390×844" },
            ]}
            value={frameKind}
            onChange={setFrameKind}
          />
          <Segmented<"dark" | "light">
            ariaLabel="明暗"
            options={[
              { value: "dark", label: "暗" },
              { value: "light", label: "淡" },
            ]}
            value={isDark ? "dark" : "light"}
            onChange={(v) => onDarkChange(v === "dark")}
          />
          <span style={{ ...eyebrow, letterSpacing: ".04em" }}>
            {frame.w}×{frame.h} · 縮放 {Math.round(scale * 100)}% · 雷達點 {points.length} 座（{CENTER_ICAO} 半徑 {layout.radiusKm} km，真實機場）
          </span>
        </div>
        <div ref={hostRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <div style={{ width: frame.w * scale, height: frame.h * scale, outline: `1px solid ${tokens.border}`, overflow: "hidden" }}>
            <div
              data-testid="boot-preview"
              style={{ position: "relative", width: frame.w, height: frame.h, transform: `scale(${scale})`, transformOrigin: "0 0", background: mix(tokens.fg1, 4), overflow: "hidden" }}
            >
              <MockChrome kind={frameKind} />
              {bootMaskVisible(phase) && (
                <BootScreen
                  key={boot?.startedAt ?? "hold"}
                  contained
                  phase={phase === "loading" ? "loading" : phase === "done" ? "done" : "leaving"}
                  label={CENTER_ICAO}
                  points={points}
                  layout={layout}
                  reducedMotion={reduced}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 控制面板 ── */}
      <div
        style={{
          width: 340,
          flex: "none",
          overflowY: "auto",
          borderLeft: `1px solid ${tokens.border}`,
          background: tokens.panel,
          padding: SPACE.s16,
          display: "flex",
          flexDirection: "column",
          gap: SPACE.s12,
        }}
      >
        <div style={{ display: "flex", gap: SPACE.s8, flexWrap: "wrap" }}>
          <Button variant="primary" onClick={replay}>重播開場</Button>
          <Button onClick={() => setLayout({ ...BOOT_LAYOUT })}>重設預設值</Button>
          <Button onClick={copy} width={96}>
            {copyState === "copied" ? "已複製" : copyState === "selected" ? "請按 ⌘C" : "複製設定"}
          </Button>
        </div>
        <Toggle
          checked={hold}
          onChange={(v) => {
            setHold(v);
            if (v) setBoot(null);
          }}
          label="固定顯示遮罩"
          description="調尺寸時開著；按「重播開場」會關掉並跑完整時序（含面板彈入）"
        />
        <span style={eyebrow}>LAYOUT · 參數（bootLayout.ts）</span>
        {BOOT_LAYOUT_FIELDS.map((f) => (
          <Slider
            key={f.key}
            label={f.label}
            min={f.min}
            max={f.max}
            step={f.step}
            value={layout[f.key]}
            format={(v) => `${fmtNum(v)}${f.unit ? ` ${f.unit}` : ""}`}
            onChange={(v) => set(f.key, v)}
            ariaLabel={f.key}
          />
        ))}
        <span style={eyebrow}>COPY · 貼回 bootLayout.ts</span>
        <textarea
          ref={textRef}
          readOnly
          value={tsText}
          aria-label="目前設定（TS）"
          rows={BOOT_LAYOUT_FIELDS.length + 2}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "vertical",
            fontFamily: FONT.data,
            fontSize: SIZE.minor,
            lineHeight: 1.5,
            color: tokens.fg1,
            background: tokens.ctl,
            border: `1px solid ${tokens.border}`,
            borderRadius: RADIUS.base,
            padding: SPACE.s8,
          }}
        />
      </div>
    </div>
  );
}

export function BootTuner() {
  const [isDark, setIsDark] = useState(true);
  return (
    <ThemeProvider isDark={isDark}>
      <TunerBody isDark={isDark} onDarkChange={setIsDark} />
    </ThemeProvider>
  );
}
