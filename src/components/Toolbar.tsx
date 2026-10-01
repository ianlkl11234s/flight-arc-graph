import type { DepArrFilter, RenderMode } from "../types";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, RADIUS, SPACE, Z } from "../styles/tokens";
import { Button, Segmented } from "../ui";
import { StyleSelector } from "./StyleSelector";

interface ToolbarProps {
  depArrFilter: DepArrFilter;
  onDepArrChange: (f: DepArrFilter) => void;
  renderMode: RenderMode;
  onRenderModeChange: (m: RenderMode) => void;
  mapStyleId: string;
  onMapStyleChange: (id: string) => void;
  onCapture: () => void;
  onInfo: () => void;
}

function IconInfo() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <circle cx="7" cy="7" r="5.8" />
      <path d="M7 6.2v3.8" strokeLinecap="square" />
      <circle cx="7" cy="4.2" r=".75" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** 工具列高度（Segmented／Button 28 + padding 4×2 + border 1×2） */
export const TOOLBAR_HEIGHT = 38;
/** 工具列下緣再空 8px：右上狀態條、右側統計浮層的 top */
export const BELOW_TOOLBAR = SPACE.s16 + TOOLBAR_HEIGHT + SPACE.s8;

function Divider() {
  const { tokens } = useTheme();
  return <span aria-hidden="true" style={{ width: 1, height: 16, background: tokens.border, flex: "none" }} />;
}

/**
 * 右上唯一工具列（spec R3）：起降 ｜ 2D/3D · 底圖 ｜ 錄影 · 說明，固定順序、單排。
 * 「染色」組未放：現有程式沒有「起降染色」模式（見 P3 回報）。
 */
export function Toolbar(p: ToolbarProps) {
  const { tokens } = useTheme();
  return (
    <div
      role="toolbar"
      aria-label="工具列"
      style={{
        position: "absolute",
        top: SPACE.s16,
        right: SPACE.s16,
        zIndex: Z.toolbar,
        display: "flex",
        flexWrap: "nowrap",
        alignItems: "center",
        gap: SPACE.s6,
        padding: SPACE.s4,
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px)`,
        WebkitBackdropFilter: `blur(${BLUR}px)`,
      }}
    >
      <Segmented<DepArrFilter>
        ariaLabel="起降"
        options={[
          { value: "all", label: "全部" },
          { value: "arr", label: "進場" },
          { value: "dep", label: "離場" },
        ]}
        value={p.depArrFilter}
        onChange={p.onDepArrChange}
      />
      <Divider />
      <Segmented<RenderMode>
        ariaLabel="2D／3D"
        options={[
          { value: "2d", label: "2D", title: "2D Flat" },
          { value: "3d", label: "3D", title: "3D Altitude" },
        ]}
        value={p.renderMode}
        onChange={p.onRenderModeChange}
      />
      <StyleSelector selected={p.mapStyleId} onChange={p.onMapStyleChange} width={132} />
      <Divider />
      <Button
        onClick={p.onCapture}
        title="錄影（Capture）"
        icon={<span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: RADIUS.pill, background: tokens.rec, display: "inline-block" }} />}
      >
        錄影
      </Button>
      <Button variant="ghost" icon={<IconInfo />} ariaLabel="說明" onClick={p.onInfo} />
    </div>
  );
}
