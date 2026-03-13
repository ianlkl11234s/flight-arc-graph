import { useEffect, useState } from "react";

const TOTAL_SECONDS = 30;
const TIP_INTERVAL = 4000; // 4 秒切換

const TIPS = [
  // 資料來源
  "「航線軌跡」提供各機場最精細的起降軌道，適合切換到特定機場仔細觀察",
  "「空域快照」涵蓋所有經過台灣的航班（含過境），航班較多時建議將時間軸調整為 3d",
  "「空域快照」旁的機型篩選，可以只看軍機、直升機、商務機等特定類別",
  // 顯示模式
  "開啟 ±12h Window 只顯示當前時間前後 12 小時的航班，大幅減少視覺雜訊",
  "切換 Live Status 模式可隱藏軌跡線，更清楚觀察即時空域中的飛機分佈",
  "右上角 3D / 2D 切換：2D 模式會將所有軌跡投影到地面，呈現不同的視覺效果",
  // 拍攝與互動
  "右上角的 Capture 可進入沈浸式拍攝模式，按 ESC 退出",
  "點擊飛機光球可查看航班資訊，雙擊可鎖定追蹤該航班飛行",
  "右鍵拖曳可旋轉視角，滾輪縮放地圖，找到最佳觀賞角度",
  // 側邊控制面板
  "點選左側 icon 開啟面板，再次點選或按 ✕ 即可收起",
  "左側齒輪面板可調整軌跡透明度、光球大小等視覺參數",
  "左側定位 icon 可快速跳轉到全台 22 座機場的預設視角",
  "左側行事曆 icon 可查看與切換不同日期的航班資料",
  // 統計與範圍
  "航線軌跡模式下，左側統計 icon 可查看該機場的航班統計與排名",
  "All Taiwan 模式搭配空域快照，可觀察不停降台灣的過境航班",
  // 小知識
  "軌跡顏色由高度決定 — 暖橘色為低空，冷藍色為高空巡航",
  "每日約 2,600+ 筆航線軌跡、20,000+ 筆空域快照資料",
  "資料來源：FlightRadar24 API（航線）+ OpenSky Network（空域）",
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
