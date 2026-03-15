import { useEffect, useRef, useState } from "react";
import { FLAT_TIPS } from "../data/tips";

const TOTAL_SECONDS = 30;
const TIP_INTERVAL = 4000; // 4 秒切換

export function LoadingScreen() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * FLAT_TIPS.length));
  const [tipFade, setTipFade] = useState(true); // true = visible

  // 倒數計時
  useEffect(() => {
    const t0 = Date.now();
    let raf: number;
    const tick = () => {
      setElapsedMs(Math.min(TOTAL_SECONDS * 1000, Date.now() - t0));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tips 輪播
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    const id = setInterval(() => {
      setTipFade(false); // 開始淡出
      fadeTimerRef.current = setTimeout(() => {
        setTipIdx((prev) => {
          let next;
          do { next = Math.floor(Math.random() * FLAT_TIPS.length); } while (next === prev && FLAT_TIPS.length > 1);
          return next;
        });
        setTipFade(true); // 淡入新 tip
      }, 400);
    }, TIP_INTERVAL);
    return () => {
      clearInterval(id);
      clearTimeout(fadeTimerRef.current);
    };
  }, []);

  const remainingSec = Math.max(0, TOTAL_SECONDS - elapsedMs / 1000);
  const progress = Math.min(1, elapsedMs / (TOTAL_SECONDS * 1000));

  // 飛機沿弧線飛行的位置
  const planeX = 20 + progress * 260;
  const arcY = 70 - 160 * progress * (1 - progress);
  const tilt = progress < 0.5
    ? -15 + progress * 10
    : -10 + (progress - 0.5) * 30;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0a14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        fontFamily: "monospace",
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 22, letterSpacing: 4, fontWeight: 700 }}>
        Flight Arc
      </div>

      {/* 飛機動畫區域 */}
      <svg width="300" height="80" viewBox="0 0 300 80" style={{ overflow: "visible" }}>
        <path
          d={`M 20 70 Q 150 ${70 - 160 * 0.25} 280 70`}
          fill="none"
          stroke="rgba(100,170,255,0.1)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <path
          d={`M 20 70 Q 150 ${70 - 160 * 0.25} 280 70`}
          fill="none"
          stroke="rgba(100,170,255,0.15)"
          strokeWidth="1"
          strokeDasharray={`${progress * 280} 1000`}
        />
        <circle cx="20" cy="70" r="2" fill="rgba(100,170,255,0.4)" />
        <circle cx="280" cy="70" r="2" fill="rgba(100,170,255,0.2)" />

        <g transform={`translate(${planeX}, ${arcY}) rotate(${tilt})`}>
          <circle cx="0" cy="0" r="8" fill="rgba(100,170,255,0.15)" />
          <circle cx="0" cy="0" r="4" fill="rgba(100,170,255,0.25)" />
          <g transform="scale(0.7)" fill="rgba(255,255,255,0.9)">
            <path d="M-2,-6 L0,-10 L2,-6 L2,2 L7,6 L7,8 L2,5 L2,8 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-2,8 L-2,5 L-7,8 L-7,6 L-2,2 Z" />
          </g>
          <circle cx="0" cy="0" r="2" fill="#ff4444" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>

        {[...Array(5)].map((_, i) => {
          const t = Math.max(0, progress - (i + 1) * 0.03);
          const px = 20 + t * 260;
          const py = 70 - 160 * t * (1 - t);
          const opacity = 0.4 - i * 0.08;
          return (
            <circle
              key={i}
              cx={px}
              cy={py}
              r={1.5 - i * 0.2}
              fill={`rgba(100,170,255,${Math.max(0, opacity)})`}
            />
          );
        })}
      </svg>

      {/* 進度條 */}
      <div
        style={{
          width: 200,
          height: 2,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "rgba(100,170,255,0.6)",
            borderRadius: 1,
            transition: "width 0.3s linear",
          }}
        />
      </div>

      {/* 倒數 */}
      <div style={{ fontSize: 28, fontWeight: 700, color: "rgba(100,170,255,0.9)", letterSpacing: 2, fontVariantNumeric: "tabular-nums" }}>
        {remainingSec > 0 ? remainingSec.toFixed(3) : "0.000"}
      </div>

      {/* Tips 輪播 */}
      <div
        style={{
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          maxWidth: "80vw",
          width: "100%",
          padding: "0 20px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            lineHeight: 1,
            color: "rgba(255,255,255,0.45)",
            opacity: tipFade ? 1 : 0,
            transition: "opacity 0.4s ease",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {FLAT_TIPS[tipIdx]}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
        多數狀態下 30 秒可以載入完成
      </div>
    </div>
  );
}
