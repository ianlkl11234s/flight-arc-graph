import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RenderMode } from "../types";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Button } from "../ui";
import { AirportSelector } from "./AirportSelector";
import { IconInfo, IconLink } from "./Toolbar";

/** 手機 header 內容高度（不含 safe-area-inset-top） */
export const MOBILE_HEADER_HEIGHT = 44;
const MENU_WIDTH = 190;

interface Props {
  airports: string[];
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  renderMode: RenderMode;
  onRenderModeChange: (m: RenderMode) => void;
  onCapture: () => void;
  onInfo: () => void;
  /** 複製目前畫面的連結（P6）；回傳是否成功 */
  onCopyLink: () => Promise<boolean>;
}

function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <circle cx="2.5" cy="7" r="1.2" />
      <circle cx="7" cy="7" r="1.2" />
      <circle cx="11.5" cy="7" r="1.2" />
    </svg>
  );
}

function MenuItem({
  icon,
  label,
  value,
  onClick,
  ...rest
}: {
  icon?: ReactNode;
  label: string;
  value?: string;
  onClick: () => void;
  "aria-live"?: "polite";
}) {
  const { tokens } = useTheme();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="fa-focus fa-hover"
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE.s8,
        width: "100%",
        height: 32,
        padding: `0 ${SPACE.s8}px`,
        border: 0,
        borderRadius: RADIUS.base,
        background: "transparent",
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        textAlign: "left",
        cursor: "pointer",
      }}
      {...rest}
    >
      <span style={{ display: "flex", width: 14, color: tokens.fg2 }}>{icon}</span>
      <span style={{ flex: 1, whiteSpace: "nowrap" }}>{label}</span>
      {value && <span style={{ color: tokens.fg3, fontFamily: FONT.data, whiteSpace: "nowrap" }}>{value}</span>}
    </button>
  );
}

/** ⋯ 選單：向下靠右、寬 190、點外面或 Esc 關閉（照 Pulse M1）。 */
function MoreMenu({ renderMode, onRenderModeChange, onCopyLink }: Pick<Props, "renderMode" | "onRenderModeChange" | "onCopyLink">) {
  const { tokens } = useTheme();
  const [open, setOpen] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (root && e.target instanceof Node && !root.contains(e.target)) setOpen(false);
    };
    // Esc 分層（R7）：選單排在說明視窗之後；preventDefault 讓 App 的 Esc handler 略過這一次
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleCopy = async () => {
    const ok = await onCopyLink();
    setCopy(ok ? "copied" : "failed");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setCopy("idle"); setOpen(false); }, 1200);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", display: "flex" }}>
      <Button
        variant="ghost"
        icon={<IconMore />}
        ariaLabel="更多"
        pressed={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          role="menu"
          aria-label="更多"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: MENU_WIDTH,
            zIndex: Z.popover,
            padding: SPACE.s4,
            boxSizing: "border-box",
            // 選單會蓋在時間軸等內容上：panel 底疊在不透明底色上，文字才讀得清
            backgroundColor: tokens.mapBg,
            backgroundImage: `linear-gradient(${tokens.panel}, ${tokens.panel})`,
            border: `1px solid ${tokens.border}`,
            borderRadius: RADIUS.base,
          }}
        >
          <MenuItem
            label="2D／3D 切換"
            value={renderMode === "3d" ? "3D" : "2D"}
            onClick={() => onRenderModeChange(renderMode === "3d" ? "2d" : "3d")}
          />
          <MenuItem
            icon={<IconLink />}
            label={copy === "copied" ? "已複製" : copy === "failed" ? "複製失敗" : "複製連結"}
            onClick={handleCopy}
            aria-live="polite"
          />
        </div>
      )}
    </div>
  );
}

/**
 * 手機頂端 header（照 Pulse M1）：單排、固定高、Panel 語言（panel 底 + blur + 下緣細框）。
 * 外露順序固定：機場選擇 → 錄影 → ⋯ → 說明；其餘收進 ⋯。不得加第二排、不得再加外露按鈕。
 */
export function MobileHeader(p: Props) {
  const { tokens } = useTheme();
  return (
    <div
      role="toolbar"
      aria-label="工具列"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: MOBILE_HEADER_HEIGHT,
        boxSizing: "content-box",
        zIndex: Z.toolbar,
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        gap: SPACE.s6,
        padding: `0 ${SPACE.s12}px`,
        paddingTop: "env(safe-area-inset-top, 0px)",
        background: tokens.panel,
        borderBottom: `1px solid ${tokens.border}`,
        backdropFilter: `blur(${BLUR}px)`,
        WebkitBackdropFilter: `blur(${BLUR}px)`,
      }}
    >
      <AirportSelector airports={p.airports} selected={p.selectedAirport} onChange={p.onAirportChange} />
      <div style={{ flex: 1 }} />
      <Button
        onClick={p.onCapture}
        title="錄影（Capture）"
        icon={<span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: tokens.rec, display: "inline-block" }} />}
      >
        錄影
      </Button>
      <MoreMenu renderMode={p.renderMode} onRenderModeChange={p.onRenderModeChange} onCopyLink={p.onCopyLink} />
      <Button variant="ghost" icon={<IconInfo />} ariaLabel="說明" onClick={p.onInfo} />
    </div>
  );
}
