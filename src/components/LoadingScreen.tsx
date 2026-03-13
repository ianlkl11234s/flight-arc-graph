import { useEffect, useState } from "react";

const TOTAL_SECONDS = 30;
const TIP_INTERVAL = 4000; // 4 秒切換

const TIPS = [
  "航線軌跡 會有該機場最精細的起飛降落軌道，可以切換特定機場進行觀察",
  "空域快照 會包含不降落台灣的飛機，但航班會很多，建議調整時間軸到 3d",
  "善用 Flight Trails 下的 ±12h Window，可以看到比較少但清楚的軌跡",
  "Live Status 會是沒有軌跡的模式，會更清楚的看到目前空域有哪一些飛機",
  "可以使用右上角的 Capture 來沈浸式的觀賞飛機起降",
  "右上角的 3D / 2D 切換可以讓軌跡跑到地面上",
  "如果畫面上太多軌跡重疊，可以篩選下方的時間軸或是勾起 Flight Trails 下的 ±12h Window",
  "再次點選左邊的 icon 可以收起控制面板",
  "控制面板有很多參數例如透明度、飛機的圓點大小可調整",
  "可以使用左側的第二個 icon（定位）來查看特定機場的視角",
  "可以使用左側的第三個 icon（行事曆）來看目前有哪一些天的飛機資料",
  "空域快照 旁邊可以篩選特定類型的飛機",
  "航線軌跡模式下，可以點選左邊最後一個統計 icon，來得到起降該機場的相關統計",
  "All Taiwan 模式會看到全部台灣的軌跡，建議在空域快照使用，可以看到不停降台灣的飛機",
];

export function LoadingScreen() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * TIPS.length));
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
  useEffect(() => {
    const id = setInterval(() => {
      setTipFade(false); // 開始淡出
      setTimeout(() => {
        setTipIdx((prev) => {
          let next;
          do { next = Math.floor(Math.random() * TIPS.length); } while (next === prev && TIPS.length > 1);
          return next;
        });
        setTipFade(true); // 淡入新 tip
      }, 400);
    }, TIP_INTERVAL);
    return () => clearInterval(id);
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
        Taiwan Flight Arc
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
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          maxWidth: 420,
          padding: "0 20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.45)",
            opacity: tipFade ? 1 : 0,
            transition: "opacity 0.4s ease",
          }}
        >
          {TIPS[tipIdx]}
        </div>
      </div>

      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", marginTop: 4 }}>
        多數狀態下 30 秒可以載入完成
      </div>
    </div>
  );
}
