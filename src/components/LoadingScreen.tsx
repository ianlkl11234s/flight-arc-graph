import { useEffect, useState } from "react";

const TOTAL_SECONDS = 30;

export function LoadingScreen() {
  const [elapsedMs, setElapsedMs] = useState(0);

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

  const remainingSec = Math.max(0, TOTAL_SECONDS - elapsedMs / 1000);
  const progress = Math.min(1, elapsedMs / (TOTAL_SECONDS * 1000));

  // 飛機沿弧線飛行的位置（0~1 映射到 SVG path）
  const planeX = 20 + progress * 260;
  // 弧線高度：拋物線 y = -4h * t(1-t)，h=40
  const arcY = 70 - 160 * progress * (1 - progress);
  // 飛機傾斜角度：上升時機頭朝上，下降時朝下
  const tilt = progress < 0.5
    ? -15 + progress * 10   // 上升段
    : -10 + (progress - 0.5) * 30;  // 下降段

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
        Taiwan Flight Arc
      </div>

      {/* 飛機動畫區域 */}
      <svg width="300" height="80" viewBox="0 0 300 80" style={{ overflow: "visible" }}>
        {/* 飛行弧線軌跡（已飛過的部分） */}
        <path
          d={`M 20 70 Q 150 ${70 - 160 * 0.25} 280 70`}
          fill="none"
          stroke="rgba(100,170,255,0.1)"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        {/* 已飛過的軌跡 glow */}
        <path
          d={`M 20 70 Q 150 ${70 - 160 * 0.25} 280 70`}
          fill="none"
          stroke="rgba(100,170,255,0.15)"
          strokeWidth="1"
          strokeDasharray={`${progress * 280} 1000`}
        />

        {/* 起點 */}
        <circle cx="20" cy="70" r="2" fill="rgba(100,170,255,0.4)" />
        {/* 終點 */}
        <circle cx="280" cy="70" r="2" fill="rgba(100,170,255,0.2)" />

        {/* 小飛機 */}
        <g transform={`translate(${planeX}, ${arcY}) rotate(${tilt})`}>
          {/* 機身 glow */}
          <circle cx="0" cy="0" r="8" fill="rgba(100,170,255,0.15)" />
          <circle cx="0" cy="0" r="4" fill="rgba(100,170,255,0.25)" />
          {/* 飛機圖示 */}
          <g transform="scale(0.7)" fill="rgba(255,255,255,0.9)">
            <path d="M-2,-6 L0,-10 L2,-6 L2,2 L7,6 L7,8 L2,5 L2,8 L4,10 L4,11 L0,10 L-4,11 L-4,10 L-2,8 L-2,5 L-7,8 L-7,6 L-2,2 Z" />
          </g>
          {/* 防撞燈閃爍 */}
          <circle cx="0" cy="0" r="2" fill="#ff4444" opacity="0.8">
            <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.2s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* 尾跡粒子 */}
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

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
        {remainingSec > 0 ? "Loading flight data..." : "Almost there..."}
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
        多數狀態下 30 秒可以載入完成
      </div>
    </div>
  );
}
