import type { RenderMode } from "../types";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, SPACE, Z } from "../styles/tokens";
import { Button, Segmented } from "../ui";
import { AirportSelector } from "./AirportSelector";

/** 手機 header 內容高度（不含 safe-area-inset-top） */
export const MOBILE_HEADER_HEIGHT = 44;

interface Props {
  airports: string[];
  selectedAirport: string;
  onAirportChange: (icao: string) => void;
  renderMode: RenderMode;
  onRenderModeChange: (m: RenderMode) => void;
  onCapture: () => void;
  onInfo: () => void;
}

/** 手機頂端 header：單排、固定高、Panel 語言（panel 底 + blur + 下緣細框）。 */
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
        zIndex: Z.mapOverlay,
        display: "flex",
        alignItems: "center",
        gap: SPACE.s8,
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
      <Button variant="ghost" onClick={p.onInfo}>Info</Button>
      <Button onClick={p.onCapture}>Capture</Button>
      <span style={{ display: "flex" }}>
      <Segmented<RenderMode>
        ariaLabel="2D／3D"
        options={[
          { value: "2d", label: "2D" },
          { value: "3d", label: "3D" },
        ]}
        value={p.renderMode}
        onChange={p.onRenderModeChange}
      />
      </span>
    </div>
  );
}
