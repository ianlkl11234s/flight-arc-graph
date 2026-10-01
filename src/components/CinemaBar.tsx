import React from "react";
import type { CinemaMode, CameraKeyframe, CinemaPhase, EasingType, SavedSequence } from "../hooks/useCinemaCamera";
import type { RecordingState, HQExportProgress } from "../hooks/useCanvasRecorder";
import { useTheme } from "../styles/ThemeContext";
import { FONT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { Button, Panel, Segmented, Select, Slider, Toggle } from "../ui";
import { IconChevron, IconClose } from "../ui/icons";
import { mix, themeVars } from "../ui/vars";

/* ── 小圖示（SVG，不用文字字元） ── */
const svgProps = { width: 12, height: 12, viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "square", "aria-hidden": true } as const;
const IconPlay = () => <svg {...svgProps} fill="currentColor" stroke="none"><path d="M3 2l7 4-7 4z" /></svg>;
const IconStop = () => <svg {...svgProps} fill="currentColor" stroke="none"><rect x="3" y="3" width="6" height="6" /></svg>;
const IconRecDot = () => <svg {...svgProps} fill="currentColor" stroke="none"><circle cx="6" cy="6" r="3.2" /></svg>;
const IconLoop = () => <svg {...svgProps}><path d="M2 6a4 4 0 017-2.6M10 6a4 4 0 01-7 2.6M9 1.5v2.2H6.8M3 10.5V8.3h2.2" /></svg>;
const IconPingpong = () => <svg {...svgProps}><path d="M1.5 4h8M7.5 2l2 2-2 2M10.5 8h-8M4.5 6l-2 2 2 2" /></svg>;
const IconDownload = () => <svg {...svgProps}><path d="M6 1.5v6.5M3.5 5.5L6 8l2.5-2.5M2 10.5h8" /></svg>;
const IconUpload = () => <svg {...svgProps}><path d="M6 8.5V2M3.5 4.5L6 2l2.5 2.5M2 10.5h8" /></svg>;
const IconEye = () => <svg {...svgProps}><path d="M1 6s2-3.5 5-3.5S11 6 11 6s-2 3.5-5 3.5S1 6 1 6z" /><circle cx="6" cy="6" r="1.4" /></svg>;

/* ── Duration Input (m:ss) ── */
function DurationInput({ value, onChange, min = 0, max = 5999, compact = false }: {
  value: number; onChange: (sec: number) => void; min?: number; max?: number; compact?: boolean;
}) {
  const { tokens } = useTheme();
  const m = Math.floor(value / 60);
  const s = Math.round(value % 60);
  const inputStyle: React.CSSProperties = {
    width: compact ? 30 : 34,
    background: tokens.ctl,
    border: `1px solid ${tokens.border}`,
    borderRadius: RADIUS.base,
    color: tokens.fg1,
    fontSize: compact ? SIZE.s10 : SIZE.s11,
    fontFamily: FONT.data,
    padding: compact ? "2px 3px" : "3px 4px",
    textAlign: "center",
  };
  const labelStyle: React.CSSProperties = {
    color: tokens.fg3, fontSize: SIZE.s9, fontFamily: FONT.ui,
  };
  const clamp = (newM: number, newS: number) => {
    const total = Math.max(min, Math.min(max, newM * 60 + newS));
    onChange(total);
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: SPACE.s2 }}>
      <input type="number" min={0} max={Math.floor(max / 60)} step={1} value={m}
        onChange={(e) => clamp(Number(e.target.value), s)} style={inputStyle} />
      <span style={labelStyle}>m</span>
      <input type="number" min={0} max={59} step={1} value={s}
        onChange={(e) => clamp(m, Number(e.target.value))} style={inputStyle} />
      <span style={labelStyle}>s</span>
    </span>
  );
}

interface CinemaBarProps {
  /** 已不再用於取色（改走 useTheme）；保留欄位避免動 App.tsx，P3/P4 一併移除 */
  isDarkTheme?: boolean;
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
  onRecaptureKeyframe: (id: string) => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  pingpong: boolean;
  onPingpongChange: (pp: boolean) => void;
  totalDuration: number;
  // Save/Load
  savedSequences: SavedSequence[];
  onSaveSequence: (name: string) => void;
  onLoadSequence: (id: string) => void;
  onDeleteSequence: (id: string) => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  // Recording
  recordingState: RecordingState;
  recordingTime: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  // HQ Export
  onStartHQExport: () => void;
  onStopHQExport: () => void;
  hqProgress: HQExportProgress | null;
}

export function CinemaBar({
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
  onRecaptureKeyframe,
  loop,
  onLoopChange,
  pingpong,
  onPingpongChange,
  totalDuration,
  savedSequences,
  onSaveSequence,
  onLoadSequence,
  onDeleteSequence,
  onExportJSON,
  onImportJSON,
  recordingState,
  recordingTime,
  onStartRecording,
  onStopRecording,
  onStartHQExport,
  onStopHQExport,
  hqProgress,
}: CinemaBarProps) {
  const { tokens } = useTheme();
  const [collapsed, setCollapsed] = React.useState(false);
  const [showSaveDialog, setShowSaveDialog] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const [showLoadList, setShowLoadList] = React.useState(false);

  const isRecording = recordingState === "recording";
  const isHQ = recordingState === "hq";

  const formatDuration = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = Math.round(totalSec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const floatingStyle: React.CSSProperties = {
    position: "absolute",
    bottom: 24,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: Z.toolbar,
  };
  const labelStyle: React.CSSProperties = { color: tokens.fg3, fontSize: SIZE.s10, fontFamily: FONT.ui };
  const rowBg = { background: tokens.ctl, borderRadius: RADIUS.base } as const;
  const smallText: React.CSSProperties = { fontFamily: FONT.ui, fontSize: SIZE.s11, color: tokens.fg2 };
  const ghostSmall = { width: 24, height: 24 } as const;
  const textInput: React.CSSProperties = {
    background: tokens.ctl,
    border: `1px solid ${tokens.border}`,
    borderRadius: RADIUS.base,
    color: tokens.fg1,
    fontFamily: FONT.ui,
  };

  // ── Collapsed: 只顯示一顆小按鈕 ──
  if (collapsed && cinemaPhase !== "play") {
    return (
      <div style={floatingStyle}>
        <Button onClick={() => setCollapsed(false)} icon={<IconChevron size={9} direction="up" />}>
          Cinema
        </Button>
      </div>
    );
  }

  return (
    <Panel
      floating={false}
      width="auto"
      ticks={false}
      ariaLabel="Cinema"
      style={{ ...floatingStyle, minWidth: 300, maxWidth: "90vw" }}
    >
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s8, padding: `${SPACE.s8}px ${SPACE.s12}px` }}>
      {cinemaPhase === "play" ? (
        /* ── Playing: 精簡 UI ── */
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.s12 }}>
          <span style={{ color: tokens.fg1, fontSize: SIZE.s11, fontFamily: FONT.data, display: "inline-flex", alignItems: "center", gap: SPACE.s6 }}>
            <IconPlay /> KF {currentKfIndex + 1}/{keyframes.length}{loop ? " · loop" : ""}
          </span>
          <div style={{ flex: 1, height: 2, background: mix(tokens.fg1, 20), minWidth: 100 }}>
            <div style={{ width: `${sequenceProgress * 100}%`, height: "100%", background: tokens.accent, transition: "width 0.1s" }} />
          </div>
          {isRecording && (
            <span style={{ color: tokens.rec, fontSize: SIZE.s11, fontFamily: FONT.data, animation: "pulse 1s ease-in-out infinite" }}>
              REC {formatTime(recordingTime)}
            </span>
          )}
          <Button onClick={onStopSequence} icon={<IconStop />}>Stop</Button>
        </div>
      ) : (
        <>
          {/* ── 第一列：模式 + 收合 ── */}
          <div style={{ display: "flex", gap: SPACE.s6, alignItems: "center" }}>
            <Segmented<CinemaMode>
              ariaLabel="Cinema mode"
              options={[
                { value: "off", label: "Static" },
                { value: "orbit", label: "Orbit" },
                { value: "sequence", label: "Sequence" },
              ]}
              value={cinemaMode}
              onChange={onCinemaModeChange}
            />
            <div style={{ flex: 1 }} />
            <Button variant="ghost" ariaLabel="Hide panel" title="Hide panel" onClick={() => setCollapsed(true)} icon={<IconChevron size={10} />} />
          </div>

          {/* ── Orbit 控制 ── */}
          {cinemaMode === "orbit" && (
            <div style={{ display: "flex", alignItems: "flex-end", gap: SPACE.s16 }}>
              <div style={{ width: 180 }}>
                <Slider
                  label="Speed"
                  min={0.2}
                  max={8}
                  step={0.2}
                  value={orbitSpeed}
                  onChange={onOrbitSpeedChange}
                  format={(v) => `${v.toFixed(1)}\u00b0/s`}
                />
              </div>
              <Segmented<1 | -1>
                ariaLabel="Orbit direction"
                options={[{ value: 1, label: "CW" }, { value: -1, label: "CCW" }]}
                value={orbitDirection}
                onChange={onOrbitDirectionChange}
              />
            </div>
          )}

          {/* ── Sequence 控制列 ── */}
          {cinemaMode === "sequence" && (
            <>
              {/* 操作按鈕列 */}
              <div style={{ display: "flex", gap: SPACE.s6, alignItems: "center", flexWrap: "wrap" }}>
                <Button onClick={onAddKeyframe}>+ Add KF</Button>
                {keyframes.length >= 2 && (
                  <>
                    <Button onClick={onPlaySequence} icon={<IconPlay />}>Play</Button>
                    {isRecording ? (
                      <Button variant="danger" onClick={onStopRecording} icon={<IconStop />}>
                        REC {formatTime(recordingTime)}
                      </Button>
                    ) : isHQ ? (
                      <Button pressed onClick={onStopHQExport} icon={<IconStop />}>
                        HQ {hqProgress ? `${hqProgress.percent}%` : "..."}
                      </Button>
                    ) : (
                      <>
                        <Button variant="danger" onClick={onStartRecording} title="Realtime recording" icon={<IconRecDot />}>
                          REC
                        </Button>
                        <Button onClick={onStartHQExport} title="Offline HQ export (slower, perfect framerate)">
                          HQ
                        </Button>
                      </>
                    )}
                    <Button pressed={loop} ariaLabel="Loop" title="Loop" onClick={() => onLoopChange(!loop)} icon={<IconLoop />} />
                    <Button pressed={pingpong} ariaLabel="Pingpong" title="Pingpong (forward + reverse)" onClick={() => onPingpongChange(!pingpong)} icon={<IconPingpong />} />
                    <span style={{ ...labelStyle, fontFamily: FONT.data }}>
                      {formatDuration(totalDuration)}{pingpong ? " ×2" : ""}
                    </span>
                  </>
                )}
                <div style={{ flex: 1 }} />
                {/* 儲存/載入 */}
                {keyframes.length >= 1 && (
                  <Button pressed={showSaveDialog} onClick={() => { setShowSaveDialog(v => !v); setShowLoadList(false); }}>Save</Button>
                )}
                {savedSequences.length > 0 && (
                  <Button pressed={showLoadList} onClick={() => { setShowLoadList(v => !v); setShowSaveDialog(false); }}>Load</Button>
                )}
                <Button ariaLabel="Export JSON" title="Export JSON" onClick={onExportJSON} icon={<IconDownload />} />
                <Button ariaLabel="Import JSON" title="Import JSON" onClick={onImportJSON} icon={<IconUpload />} />
              </div>

              {/* Save 對話框 */}
              {showSaveDialog && (
                <div style={{ display: "flex", gap: SPACE.s6, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Sequence name..."
                    aria-label="Sequence name"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && saveName.trim()) {
                        onSaveSequence(saveName.trim());
                        setSaveName("");
                        setShowSaveDialog(false);
                      }
                    }}
                    className="fa-focus"
                    style={{
                      ...themeVars(tokens),
                      ...textInput,
                      flex: 1,
                      height: 28,
                      boxSizing: "border-box",
                      fontSize: SIZE.s11,
                      padding: "0 8px",
                    }}
                    autoFocus
                  />
                  <Button
                    onClick={() => {
                      if (saveName.trim()) {
                        onSaveSequence(saveName.trim());
                        setSaveName("");
                        setShowSaveDialog(false);
                      }
                    }}
                  >
                    OK
                  </Button>
                </div>
              )}

              {/* Load 列表 */}
              {showLoadList && savedSequences.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 120, overflowY: "auto" }}>
                  {savedSequences.map(seq => (
                    <div key={seq.id} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: SPACE.s8,
                      padding: "3px 8px",
                      ...rowBg,
                    }}>
                      <span style={{ ...smallText, flex: 1, color: tokens.fg1 }}>
                        {seq.name}
                      </span>
                      <span style={{ ...labelStyle, fontSize: SIZE.s10 }}>
                        {seq.keyframes.length} KF
                      </span>
                      <Button variant="ghost" onClick={() => { onLoadSequence(seq.id); setShowLoadList(false); }} style={{ height: 24 }}>
                        Load
                      </Button>
                      <Button variant="ghost" ariaLabel="Delete sequence" onClick={() => onDeleteSequence(seq.id)} icon={<IconClose size={10} />} style={ghostSmall} />
                    </div>
                  ))}
                </div>
              )}

              {/* Keyframe 列表 */}
              {keyframes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s4, maxHeight: 200, overflowY: "auto" }}>
                  {keyframes.map((kf, i) => (
                    <React.Fragment key={kf.id}>
                      {/* 主列 */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: SPACE.s8,
                        padding: "4px 8px",
                        ...rowBg,
                      }}>
                        <span style={{ ...labelStyle, fontSize: SIZE.s11, minWidth: 20, fontFamily: FONT.data }}>
                          {i + 1}.
                        </span>
                        <span style={{ ...smallText, fontFamily: FONT.data, minWidth: 45 }}>
                          z{kf.zoom.toFixed(1)}
                        </span>
                        <DurationInput value={kf.duration} onChange={(sec) => onUpdateKeyframe(kf.id, { duration: sec })} min={1} max={5999} />
                        <Select<EasingType>
                          ariaLabel="Easing"
                          width={84}
                          value={kf.easing}
                          onChange={(v) => onUpdateKeyframe(kf.id, { easing: v })}
                          options={[
                            { value: "ease-in-out", label: "ease" },
                            { value: "linear", label: "linear" },
                            { value: "ease-out", label: "ease-out" },
                          ]}
                        />
                        <Button variant="ghost" ariaLabel="Move up" onClick={() => onMoveKeyframe(kf.id, -1)} disabled={i === 0} icon={<IconChevron size={10} direction="up" />} style={ghostSmall} />
                        <Button variant="ghost" ariaLabel="Move down" onClick={() => onMoveKeyframe(kf.id, 1)} disabled={i === keyframes.length - 1} icon={<IconChevron size={10} />} style={ghostSmall} />
                        <Button variant="ghost" ariaLabel="Recapture" title="Recapture" onClick={() => onRecaptureKeyframe(kf.id)} icon={<IconLoop />} style={ghostSmall} />
                        <Button variant="ghost" ariaLabel="Preview" onClick={() => onPreviewKeyframe(kf.id)} icon={<IconEye />} style={ghostSmall} />
                        <Button variant="ghost" ariaLabel="Remove keyframe" onClick={() => onRemoveKeyframe(kf.id)} icon={<IconClose size={10} />} style={{ ...ghostSmall, color: tokens.danger }} />
                      </div>
                      {/* Hold 設定列 */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: SPACE.s6,
                        paddingLeft: 28,
                        paddingBottom: SPACE.s2,
                      }}>
                        <span style={labelStyle}>hold</span>
                        <Toggle
                          ariaLabel="Hold"
                          checked={!!kf.hold}
                          onChange={(on) => {
                            if (!on) {
                              onUpdateKeyframe(kf.id, { hold: undefined });
                            } else {
                              onUpdateKeyframe(kf.id, { hold: { type: "still", duration: 5 } });
                            }
                          }}
                        />
                        {kf.hold && (
                          <>
                            <Select<"still" | "orbit">
                              ariaLabel="Hold type"
                              width={72}
                              value={kf.hold.type}
                              onChange={(v) => onUpdateKeyframe(kf.id, {
                                hold: {
                                  ...kf.hold!,
                                  type: v,
                                  ...(v === "orbit" ? { speed: kf.hold!.speed ?? 2, direction: kf.hold!.direction ?? 1 } : {}),
                                },
                              })}
                              options={[
                                { value: "still", label: "still" },
                                { value: "orbit", label: "orbit" },
                              ]}
                            />
                            <DurationInput compact value={kf.hold.duration} onChange={(sec) => onUpdateKeyframe(kf.id, {
                                hold: { ...kf.hold!, duration: sec },
                              })} min={1} max={5999} />
                            {kf.hold.type === "orbit" && (
                              <>
                                <input
                                  type="number"
                                  aria-label="Hold orbit speed"
                                  min={0.5}
                                  max={10}
                                  step={0.5}
                                  value={kf.hold.speed ?? 2}
                                  onChange={(e) => onUpdateKeyframe(kf.id, {
                                    hold: { ...kf.hold!, speed: Number(e.target.value) },
                                  })}
                                  style={{
                                    ...textInput,
                                    width: 36,
                                    fontSize: SIZE.s10,
                                    fontFamily: FONT.data,
                                    padding: "1px 3px",
                                    textAlign: "center" as const,
                                  }}
                                />
                                <span style={labelStyle}>°/s</span>
                                <Button
                                  variant="ghost"
                                  onClick={() => onUpdateKeyframe(kf.id, {
                                    hold: { ...kf.hold!, direction: (kf.hold!.direction ?? 1) === 1 ? -1 : 1 },
                                  })}
                                  style={{ height: 24 }}
                                >
                                  {(kf.hold.direction ?? 1) === 1 ? "CW" : "CCW"}
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
    </Panel>
  );
}
