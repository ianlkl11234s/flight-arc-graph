import { useState, useCallback } from "react";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Panel } from "../ui";

type SheetLevel = "collapsed" | "half" | "full";

const LEVELS: SheetLevel[] = ["collapsed", "half", "full"];

interface Props {
  isLandscape: boolean;
  children: (level: SheetLevel) => React.ReactNode;
}

function getHeight(level: SheetLevel, isLandscape: boolean): number {
  if (isLandscape) {
    switch (level) {
      case "collapsed": return 36;
      case "half": return Math.min(180, window.innerHeight * 0.45);
      case "full": return Math.min(340, window.innerHeight * 0.5);
    }
  }
  switch (level) {
    case "collapsed": return 36;
    case "half": return 200;
    case "full": return 420;
  }
}

/** 手機底部抽屜：Panel 外殼語言（panel 底 + blur + 細框 + 近直角），上緣 grab bar；對角刻度省略（spec §3）。 */
export function MobileBottomSheet({ isLandscape, children }: Props) {
  const { tokens } = useTheme();
  const [level, setLevel] = useState<SheetLevel>("collapsed");

  const cycleLevel = useCallback(() => {
    setLevel((prev) => {
      const idx = LEVELS.indexOf(prev);
      return LEVELS[(idx + 1) % LEVELS.length]!;
    });
  }, []);

  const height = getHeight(level, isLandscape);

  return (
    <Panel
      floating={false}
      ticks={false}
      ariaLabel="設定抽屜"
      width="auto"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        height,
        zIndex: Z.popover,
        borderBottom: 0,
        transition: "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        overflow: "hidden",
      }}
    >
      {/* Grab bar：點一下切換 收合／半開／全開 */}
      <button
        type="button"
        onClick={cycleLevel}
        aria-label="展開或收合設定抽屜"
        className="fa-focus"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: `${SPACE.s8}px 0`,
          border: 0,
          background: "transparent",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{ width: 36, height: 4, borderRadius: RADIUS.base, background: tokens.fg3 }}
        />
      </button>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: level === "full" ? "auto" : "hidden",
          overflowX: "hidden",
          padding: `0 ${SPACE.s16}px`,
        }}
      >
        {children(level)}
      </div>
    </Panel>
  );
}

/** 抽屜內的次要說明行（例：班數）。 */
export function SheetNote({ children }: { children: React.ReactNode }) {
  const { tokens } = useTheme();
  return (
    <div style={{ marginTop: SPACE.s8, color: tokens.fg3, fontSize: SIZE.body, fontFamily: FONT.ui }}>
      {children}
    </div>
  );
}
