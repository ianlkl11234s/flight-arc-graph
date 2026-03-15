import React from "react";
import type { CinemaMode, CameraKeyframe, CinemaPhase, EasingType } from "../hooks/useCinemaCamera";

interface CinemaBarProps {
  isDarkTheme: boolean;
  cinemaMode: CinemaMode;
  onCinemaModeChange: (mode: CinemaMode) => void;
  orbitSpeed: number;
  onOrbitSpeedChange: (speed: number) => void;
  orbitDirection: 1 | -1;
  onOrbitDirectionChange: (dir: 1 | -1) => void;
  // Keyframe system
  keyframes: CameraKeyframe[];
  cinemaPhase: CinemaPhase;
  onAddKeyframe: () => void;
  onRemoveKeyframe: (id: string) => void;
  onUpdateKeyframe: (id: string, updates: Partial<CameraKeyframe>) => void;
  onMoveKeyframe: (id: string, direction: -1 | 1) => void;
  onPreviewKeyframe: (id: string) => void;
  onPlaySequence: () => void;
  onStopSequence: () => void;
  sequenceProgress: number;
  currentKfIndex: number;
}

export function CinemaBar({
  isDarkTheme,
  cinemaMode,
  onCinemaModeChange,
  orbitSpeed,
  onOrbitSpeedChange,
  orbitDirection,
  onOrbitDirectionChange,
  keyframes,
  cinemaPhase,
  onAddKeyframe,
  onRemoveKeyframe,
  onUpdateKeyframe,
  onMoveKeyframe,
  onPreviewKeyframe,
  onPlaySequence,
  onStopSequence,
  sequenceProgress,
  currentKfIndex,
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

  const tinyBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 4,
  };

  return (
    <div
      style={{
        position: "absolute",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 22,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "10px 20px",
        borderRadius: 20,
        background: dark ? "rgba(20,20,20,0.7)" : "rgba(10,10,10,0.6)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.1)"}`,
        minWidth: 300,
      }}
    >
      {cinemaPhase === "play" ? (
        /* Playing mode - compact UI */
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#fff", fontSize: 13, fontFamily: "monospace" }}>
            ▶ KF {currentKfIndex + 1}/{keyframes.length}
          </span>
          {/* Progress bar */}
          <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, minWidth: 100 }}>
            <div style={{ width: `${sequenceProgress * 100}%`, height: "100%", background: "#fff", borderRadius: 2, transition: "width 0.1s" }} />
          </div>
          <button onClick={onStopSequence} style={pillStyle(true)}>■ Stop</button>
        </div>
      ) : (
        <>
          {/* Mode selection row */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => onCinemaModeChange("off")} style={pillStyle(cinemaMode === "off")}>Static</button>
            <button onClick={() => onCinemaModeChange("orbit")} style={pillStyle(cinemaMode === "orbit")}>Orbit</button>
            <button onClick={() => onCinemaModeChange("sequence")} style={pillStyle(cinemaMode === "sequence")}>Sequence</button>

            {cinemaMode === "sequence" && (
              <>
                <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)" }} />
                <button onClick={onAddKeyframe} style={pillStyle(false)}>+ Add KF</button>
                {keyframes.length >= 2 && (
                  <button onClick={onPlaySequence} style={pillStyle(false)}>▶ Play</button>
                )}
              </>
            )}
          </div>

          {/* Orbit controls */}
          {cinemaMode === "orbit" && (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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
                <button onClick={() => onOrbitDirectionChange(1)} style={smallBtnStyle(orbitDirection === 1)}>CW</button>
                <button onClick={() => onOrbitDirectionChange(-1)} style={smallBtnStyle(orbitDirection === -1)}>CCW</button>
              </div>
            </div>
          )}

          {/* Sequence keyframe list */}
          {cinemaMode === "sequence" && keyframes.length > 0 && (
            <div style={{ marginTop: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {keyframes.map((kf, i) => (
                <div key={kf.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 8px",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.05)",
                }}>
                  {/* Index */}
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, fontFamily: "monospace", minWidth: 20 }}>
                    {i + 1}.
                  </span>
                  {/* Zoom info */}
                  <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "monospace", minWidth: 45 }}>
                    z{kf.zoom.toFixed(1)}
                  </span>
                  {/* Duration input */}
                  <input
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={kf.duration}
                    onChange={(e) => onUpdateKeyframe(kf.id, { duration: Number(e.target.value) })}
                    style={{
                      width: 40,
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 4,
                      color: "#fff",
                      fontSize: 11,
                      fontFamily: "monospace",
                      padding: "2px 4px",
                      textAlign: "center" as const,
                    }}
                  />
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 10 }}>s</span>
                  {/* Easing select */}
                  <select
                    value={kf.easing}
                    onChange={(e) => onUpdateKeyframe(kf.id, { easing: e.target.value as EasingType })}
                    style={{
                      background: "rgba(255,255,255,0.1)",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: 4,
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 10,
                      fontFamily: "monospace",
                      padding: "2px 4px",
                    }}
                  >
                    <option value="ease-in-out" style={{ background: "#333" }}>ease</option>
                    <option value="linear" style={{ background: "#333" }}>linear</option>
                    <option value="ease-out" style={{ background: "#333" }}>ease-out</option>
                  </select>
                  {/* Action buttons */}
                  <button onClick={() => onMoveKeyframe(kf.id, -1)} style={tinyBtnStyle} disabled={i === 0}>▲</button>
                  <button onClick={() => onMoveKeyframe(kf.id, 1)} style={tinyBtnStyle} disabled={i === keyframes.length - 1}>▼</button>
                  <button onClick={() => onPreviewKeyframe(kf.id)} style={tinyBtnStyle}>👁</button>
                  <button onClick={() => onRemoveKeyframe(kf.id)} style={{ ...tinyBtnStyle, color: "rgba(255,100,100,0.7)" }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
