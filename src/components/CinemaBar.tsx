import React from "react";
import type { CinemaMode } from "../hooks/useCinemaCamera";

interface CinemaBarProps {
  isDarkTheme: boolean;
  cinemaMode: CinemaMode;
  onCinemaModeChange: (mode: CinemaMode) => void;
  orbitSpeed: number;
  onOrbitSpeedChange: (speed: number) => void;
  orbitDirection: 1 | -1;
  onOrbitDirectionChange: (dir: 1 | -1) => void;
}

export function CinemaBar({
  isDarkTheme,
  cinemaMode,
  onCinemaModeChange,
  orbitSpeed,
  onOrbitSpeedChange,
  orbitDirection,
  onOrbitDirectionChange,
}: CinemaBarProps) {
  const dark = isDarkTheme;

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px",
    borderRadius: 16,
    border: `1px solid ${active ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.12)"}`,
    background: active
      ? (dark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.25)")
      : (dark ? "rgba(60,60,60,0.4)" : "rgba(40,40,40,0.5)"),
    color: active ? "#fff" : "rgba(255,255,255,0.6)",
    fontSize: 13,
    fontFamily: "monospace",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    backdropFilter: "blur(8px)",
    transition: "all 0.2s",
  });

  const labelStyle: React.CSSProperties = {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontFamily: "monospace",
    letterSpacing: 0.5,
  };

  const sliderStyle: React.CSSProperties = {
    width: 80,
    accentColor: dark ? "#aaa" : "#3B82F6",
    cursor: "pointer",
  };

  const smallBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    borderRadius: 10,
    border: `1px solid ${active ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.12)"}`,
    background: active ? "rgba(255,255,255,0.12)" : "transparent",
    color: active ? "#fff" : "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "monospace",
    cursor: "pointer",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 22,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 20px",
        borderRadius: 20,
        background: dark ? "rgba(20,20,20,0.7)" : "rgba(10,10,10,0.6)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.1)"}`,
      }}
    >
      {/* Mode pills */}
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => onCinemaModeChange("off")}
          style={pillStyle(cinemaMode === "off")}
        >
          Static
        </button>
        <button
          onClick={() => onCinemaModeChange("orbit")}
          style={pillStyle(cinemaMode === "orbit")}
        >
          Orbit
        </button>
      </div>

      {/* Orbit controls - only show when orbit is active */}
      {cinemaMode === "orbit" && (
        <>
          {/* Divider */}
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />

          {/* Speed */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={labelStyle}>Speed</span>
            <input
              type="range"
              min={0.2}
              max={8}
              step={0.2}
              value={orbitSpeed}
              onChange={(e) => onOrbitSpeedChange(Number(e.target.value))}
              style={sliderStyle}
            />
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontFamily: "monospace", minWidth: 40 }}>
              {orbitSpeed.toFixed(1)}&deg;/s
            </span>
          </div>

          {/* Direction */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => onOrbitDirectionChange(1)}
              style={smallBtnStyle(orbitDirection === 1)}
            >
              CW
            </button>
            <button
              onClick={() => onOrbitDirectionChange(-1)}
              style={smallBtnStyle(orbitDirection === -1)}
            >
              CCW
            </button>
          </div>
        </>
      )}
    </div>
  );
}
