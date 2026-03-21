import { useEffect, useState } from "react";

interface RecordingGuideProps {
  visible: boolean;
  showGrid: boolean;
}

/**
 * 攝影輔助框（HTML overlay，不會被錄進 composite canvas）
 * - 16:9 安全框 + 超出區域遮罩
 * - 中心十字準心
 * - 三分法格線（可切換）
 */
export function RecordingGuide({ visible, showGrid }: RecordingGuideProps) {
  const [rect, setRect] = useState({ top: 0, left: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!visible) return;

    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const targetRatio = 16 / 9;
      const currentRatio = vw / vh;

      let w: number, h: number, x: number, y: number;
      if (currentRatio > targetRatio) {
        // 視窗太寬 → 左右會有 letterbox
        h = vh;
        w = vh * targetRatio;
        x = (vw - w) / 2;
        y = 0;
      } else {
        // 視窗太高 → 上下會有 letterbox
        w = vw;
        h = vw / targetRatio;
        x = 0;
        y = (vh - h) / 2;
      }
      setRect({ top: y, left: x, width: w, height: h });
    };

    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [visible]);

  if (!visible) return null;

  const { top, left, width, height } = rect;
  const borderColor = "rgba(255,80,80,0.6)";
  const guideColor = "rgba(255,255,255,0.15)";
  const maskColor = "rgba(0,0,0,0.45)";

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 50, pointerEvents: "none" }}>
      {/* 四邊遮罩（超出 16:9 的區域） */}
      {/* top */}
      {top > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: top, background: maskColor }} />
      )}
      {/* bottom */}
      {top > 0 && (
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: top, background: maskColor }} />
      )}
      {/* left */}
      {left > 0 && (
        <div style={{ position: "absolute", top, left: 0, width: left, height, background: maskColor }} />
      )}
      {/* right */}
      {left > 0 && (
        <div style={{ position: "absolute", top, right: 0, width: left, height, background: maskColor }} />
      )}

      {/* 16:9 邊框 */}
      <div
        style={{
          position: "absolute",
          top,
          left,
          width,
          height,
          border: `2px solid ${borderColor}`,
          boxSizing: "border-box",
        }}
      >
        {/* 角落標記 */}
        {[
          { t: -1, l: -1, b: "auto", r: "auto" },
          { t: -1, l: "auto", b: "auto", r: -1 },
          { t: "auto", l: -1, b: -1, r: "auto" },
          { t: "auto", l: "auto", b: -1, r: -1 },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: pos.t,
              left: pos.l,
              bottom: pos.b,
              right: pos.r,
              width: 24,
              height: 24,
              borderTop: typeof pos.t === "number" ? `3px solid ${borderColor}` : "none",
              borderBottom: typeof pos.b === "number" ? `3px solid ${borderColor}` : "none",
              borderLeft: typeof pos.l === "number" ? `3px solid ${borderColor}` : "none",
              borderRight: typeof pos.r === "number" ? `3px solid ${borderColor}` : "none",
            }}
          />
        ))}

        {/* 中心十字準心 */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 32,
            height: 32,
          }}
        >
          {/* 橫線 */}
          <div style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            height: 1,
            background: borderColor,
          }} />
          {/* 直線 */}
          <div style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: borderColor,
          }} />
          {/* 中心點 */}
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: borderColor,
          }} />
        </div>

        {/* 三分法格線 */}
        {showGrid && (
          <>
            {[1, 2].map((n) => (
              <div
                key={`h${n}`}
                style={{
                  position: "absolute",
                  top: `${(n / 3) * 100}%`,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: guideColor,
                }}
              />
            ))}
            {[1, 2].map((n) => (
              <div
                key={`v${n}`}
                style={{
                  position: "absolute",
                  left: `${(n / 3) * 100}%`,
                  top: 0,
                  bottom: 0,
                  width: 1,
                  background: guideColor,
                }}
              />
            ))}
          </>
        )}

        {/* 16:9 標籤 */}
        <div style={{
          position: "absolute",
          top: 6,
          right: 8,
          fontSize: 10,
          fontFamily: "monospace",
          color: "rgba(255,80,80,0.5)",
          letterSpacing: 1,
        }}>
          16:9
        </div>
      </div>
    </div>
  );
}
