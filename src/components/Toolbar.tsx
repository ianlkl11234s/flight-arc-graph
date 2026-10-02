import { useEffect, useRef, useState } from "react";
import type { DepArrFilter, RenderMode } from "../types";
import type { TrajColorBy } from "../data/depArrColors";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Button, IconInfo, IconLink, Segmented } from "../ui";
import { StyleSelector } from "./StyleSelector";

interface ToolbarProps {
  depArrFilter: DepArrFilter;
  onDepArrChange: (f: DepArrFilter) => void;
  trajColorBy: TrajColorBy;
  onTrajColorByChange: (c: TrajColorBy) => void;
  /** 非 null = 「起降」染色不可選，字串即提示（先選機場／Compare 停用） */
  depArrColorDisabledReason: string | null;
  renderMode: RenderMode;
  onRenderModeChange: (m: RenderMode) => void;
  mapStyleId: string;
  onMapStyleChange: (id: string) => void;
  onCapture: () => void;
  onInfo: () => void;
  /** 複製目前畫面的連結（P6）；回傳是否成功 */
  onCopyLink: () => Promise<boolean>;
}

/** 「複製連結」按鈕：按下後 1.5 秒顯示「已複製」／「複製失敗」，固定寬度（R10） */
function CopyLinkButton({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const handleClick = async () => {
    const ok = await onCopy();
    setStatus(ok ? "copied" : "failed");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus("idle"), 1500);
  };
  return (
    <Button
      variant="ghost"
      icon={<IconLink />}
      width={100}
      onClick={handleClick}
      title="複製目前畫面的連結（機場、日期、時刻、鏡頭…）"
      aria-live="polite"
    >
      {status === "copied" ? "已複製" : status === "failed" ? "複製失敗" : "複製連結"}
    </Button>
  );
}

/** 工具列高度（Segmented／Button 28 + padding 4×2 + border 1×2） */
const TOOLBAR_HEIGHT = 38;
/** 工具列下緣再空 8px：右上狀態條的 top */
export const BELOW_TOOLBAR = SPACE.s16 + TOOLBAR_HEIGHT + SPACE.s8;

function Divider() {
  const { tokens } = useTheme();
  return <span aria-hidden="true" style={{ width: 1, height: 16, background: tokens.border, flex: "none" }} />;
}

/**
 * 右上唯一工具列（spec R3）：起降 ｜ 染色 ｜ 2D/3D · 底圖 ｜ 錄影 · 複製連結 · 說明，固定順序、單排。
 * 染色：高度（預設）｜起降（§7）；沒有選定機場或 Compare 時「起降」disabled。
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
      <span
        title={p.depArrColorDisabledReason ?? undefined}
        style={{ display: "inline-flex", alignItems: "center", gap: SPACE.s4 }}
      >
        <span aria-hidden="true" style={{ fontFamily: FONT.ui, fontSize: SIZE.body, color: tokens.fg3, whiteSpace: "nowrap" }}>
          染色
        </span>
        <Segmented<TrajColorBy>
          ariaLabel="染色"
          options={[
            { value: "altitude", label: "高度", title: "依高度漸層染色" },
            {
              value: "deparr",
              label: "起降",
              title: p.depArrColorDisabledReason ?? "進場藍、離場橘；組合內互飛沿路漸層",
              disabled: p.depArrColorDisabledReason !== null,
            },
          ]}
          value={p.trajColorBy}
          onChange={p.onTrajColorByChange}
        />
      </span>
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
      <CopyLinkButton onCopy={p.onCopyLink} />
      <Button variant="ghost" icon={<IconInfo />} ariaLabel="說明" onClick={p.onInfo} />
    </div>
  );
}
