import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE, Z, type ColorTokens } from "../../styles/tokens";
import { mix } from "../../ui/vars";
import { BOOT_LAYOUT, bootGeometry, type BootLayout } from "./bootLayout";
import type { RadarPoint } from "./radar";
import "./boot.css";

export type BootScreenPhase = "loading" | "done" | "leaving";

export interface BootScreenProps {
  phase: BootScreenPhase;
  /** 正在載入的對象（機場 ICAO／組合名／區域名），顯示在狀態 chip */
  label: string;
  /** 真實機場投影點（radar.ts）；空陣列 → 只畫環與掃描線 */
  points: RadarPoint[];
  layout?: BootLayout;
  /** true：絕對定位填滿父容器（調整頁預覽）；預設 fixed 蓋滿視窗 */
  contained?: boolean;
  /** 結束原因：逾時／載入失敗時 chip 不說「完成」（失敗由狀態條接手說明） */
  outcome?: "ok" | "timeout" | "failed";
  reducedMotion?: boolean;
}

const LAP = Math.PI * 2;
/** 掃描扇形拖尾角度（rad）與切片數；扇形用 globalAlpha 遞減的切片畫，不寫死任何色碼 */
const WEDGE_SPAN = 0.7;
const WEDGE_SLICES = 18;
const WEDGE_ALPHA = 0.28;
/** 點被掃過後亮度衰減的角度常數（rad） */
const DOT_DECAY = 1.8;

interface DrawOpts {
  layout: BootLayout;
  points: RadarPoint[];
  tokens: ColorTokens;
  reduced: boolean;
}

/** 畫一格雷達。size＝canvas CSS 邊長（含外圍留白），R＝雷達半徑，tMs＝開場經過時間 */
function drawRadar(c: CanvasRenderingContext2D, size: number, R: number, tMs: number, o: DrawOpts): void {
  const { layout, points, tokens, reduced } = o;
  const cx = size / 2;
  const cy = size / 2;
  c.clearRect(0, 0, size, size);
  c.globalAlpha = 1;
  c.lineWidth = 1;
  c.strokeStyle = tokens.border;
  const rings = Math.max(1, Math.round(layout.rings));
  for (let k = 1; k <= rings; k++) {
    c.beginPath();
    c.arc(cx, cy, (R * k) / rings, 0, LAP);
    c.stroke();
  }

  const swept = reduced ? Infinity : (tMs / 1000 / Math.max(0.05, layout.sweepS)) * LAP;
  if (!reduced) {
    const ang = swept % LAP; // 0 = 正北，順時針
    const toCanvas = (a: number) => a - Math.PI / 2;
    c.fillStyle = tokens.accent;
    for (let i = 0; i < WEDGE_SLICES; i++) {
      const a1 = ang - (WEDGE_SPAN * i) / WEDGE_SLICES;
      const a0 = ang - (WEDGE_SPAN * (i + 1)) / WEDGE_SLICES;
      c.globalAlpha = WEDGE_ALPHA * (1 - i / WEDGE_SLICES);
      c.beginPath();
      c.moveTo(cx, cy);
      c.arc(cx, cy, R, toCanvas(a0), toCanvas(a1));
      c.closePath();
      c.fill();
    }
    c.globalAlpha = 0.9;
    c.strokeStyle = tokens.accent;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.sin(ang) * R, cy - Math.cos(ang) * R);
    c.stroke();
  }

  c.fillStyle = tokens.accent;
  for (const p of points) {
    if (p.az > swept) continue; // 第一圈還沒掃到
    const fresh = reduced ? 0.4 : Math.exp(-((swept - p.az) % LAP) / DOT_DECAY);
    c.globalAlpha = 0.35 + 0.6 * fresh;
    c.beginPath();
    c.arc(cx + p.x * R, cy + p.y * R, Math.max(0.3, layout.dotPx * (0.75 + 0.55 * fresh)), 0, LAP);
    c.fill();
  }

  // 中心＝預設機場本身
  c.globalAlpha = 0.95;
  c.fillStyle = tokens.fg1;
  c.beginPath();
  c.arc(cx, cy, Math.max(0.6, layout.dotPx * 0.8), 0, LAP);
  c.fill();
  c.globalAlpha = 1;
}

function IconCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1.5 5.2 4 7.6 8.6 2.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

/**
 * 開場畫面（雷達掃描）：三圈距離環、琥珀掃描扇形＋掃描線、掃過處亮起真實機場點、字標與狀態 chip。
 * 只負責畫面；時序由 bootSequence／useBootPhase 推進 phase。所有尺寸參數在 bootLayout.ts。
 */
export function BootScreen({ phase, label, points, layout = BOOT_LAYOUT, contained = false, outcome = "ok", reducedMotion = false }: BootScreenProps) {
  const { tokens } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState(() => ({
    w: typeof window === "undefined" ? 1280 : window.innerWidth,
    h: typeof window === "undefined" ? 800 : window.innerHeight,
  }));

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setBox((prev) => (prev.w === el.clientWidth && prev.h === el.clientHeight ? prev : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = bootGeometry(layout, box.w, box.h);
  const pad = Math.ceil(layout.dotPx * 2 + 4);
  const size = Math.max(1, Math.round(geo.diameter + pad * 2));
  const R = geo.diameter / 2;

  // 繪圖迴圈讀最新參數，不因參數變動而重設動畫時間
  const drawRef = useRef<DrawOpts>({ layout, points, tokens, reduced: reducedMotion });
  drawRef.current = { layout, points, tokens, reduced: reducedMotion };
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr);
    cv.height = Math.round(size * dpr);
    const c = cv.getContext("2d");
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (t0Ref.current === null) t0Ref.current = performance.now();
    if (drawRef.current.reduced) {
      drawRadar(c, size, R, 0, drawRef.current);
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      drawRadar(c, size, R, now - (t0Ref.current ?? now), drawRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size, R, reducedMotion, layout, points, tokens]);

  const done = phase !== "loading";
  const chipText = !done ? `載入軌跡 · ${label}` : outcome === "ok" ? "完成" : "進入地圖";

  const rootStyle = {
    position: contained ? "absolute" : "fixed",
    inset: 0,
    zIndex: Z.boot,
    background: tokens.mapBg,
    overflow: "hidden",
    "--boot-accent": tokens.accent,
    "--boot-track": mix(tokens.fg1, 15),
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`boot-screen${phase === "leaving" ? " boot-screen--leaving" : ""}${reducedMotion ? " boot-screen--still" : ""}`}
      style={rootStyle}
      role="status"
      aria-live="polite"
      aria-label={chipText}
    >
      <div className="boot-screen__stage">
        <canvas
          ref={canvasRef}
          className="boot-screen__radar"
          aria-hidden="true"
          style={{ position: "absolute", left: geo.cx - size / 2, top: geo.cy - size / 2, width: size, height: size }}
        />
        <div
          className="boot-screen__foot"
          style={{
            position: "absolute",
            left: geo.cx,
            top: geo.footTop,
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: layout.chipGapPx,
          }}
        >
          <div
            style={{
              fontFamily: FONT.data,
              fontSize: Math.max(SIZE.eyebrow, layout.wordmarkPx),
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: ".32em",
              paddingLeft: ".32em",
              color: tokens.fg1,
              whiteSpace: "nowrap",
            }}
          >
            FLIGHT <span style={{ color: tokens.accent }}>ARC</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: SPACE.s8,
              padding: `${SPACE.s4 + 1}px ${SPACE.s12}px`,
              border: `1px solid ${tokens.border}`,
              borderRadius: RADIUS.base,
              background: tokens.panel,
              color: tokens.fg2,
              fontFamily: FONT.ui,
              fontSize: SIZE.body,
              lineHeight: 1.2,
              whiteSpace: "nowrap",
            }}
          >
            <span style={{ display: "grid", placeItems: "center", width: 10, height: 10, color: tokens.accent }}>
              {done ? <IconCheck /> : <span className="boot-screen__ring" />}
            </span>
            <span>{chipText}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
