import { useCallback, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";
import type { CameraKeyframe } from "./useCinemaCamera";
import { computeCameraAtTime, getSequenceDuration, resolvePingpongTime } from "./useCinemaCamera";

export type RecordingState = "idle" | "recording" | "hq" | "stopping";

export interface RecordingOverlay {
  regionTitle: string;
  airportLabel: string;
  timeLabel: string;
  cameraLabel: string;
  speed?: number;
  flightCount?: number;
}

/** Callback that returns a fresh overlay for each frame */
export type OverlayProvider = () => RecordingOverlay;

export interface HQExportProgress {
  current: number;
  total: number;
  percent: number;
}

interface UseCanvasRecorderOptions {
  map: MapboxMap | null;
  fps?: number;
}

interface UseCanvasRecorderReturn {
  recordingState: RecordingState;
  recordingTime: number;
  startRecording: (getOverlay: OverlayProvider) => void;
  stopRecording: () => void;
  // HQ Export
  startHQExport: (getOverlay: OverlayProvider, keyframes: CameraKeyframe[], loop: boolean, pingpong: boolean) => void;
  stopHQExport: () => void;
  hqProgress: HQExportProgress | null;
}

/** Draw vignette + title onto the composite canvas */
function drawOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  overlay: RecordingOverlay,
) {
  // Vignette (radial gradient)
  const grad = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.65);
  grad.addColorStop(0, "transparent");
  grad.addColorStop(0.6, "rgba(0,0,0,0.15)");
  grad.addColorStop(0.85, "rgba(0,0,0,0.35)");
  grad.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Text shadow helper
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.textBaseline = "top";

  const x = 32;
  let y = 32;

  // Region title
  ctx.font = "700 28px monospace";
  ctx.fillStyle = "#ffffff";
  ctx.letterSpacing = "4px";
  ctx.fillText(overlay.regionTitle, x, y);
  y += 38;

  // Airport label
  ctx.font = "600 18px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.letterSpacing = "2px";
  ctx.fillText(overlay.airportLabel, x, y);
  y += 28;

  // Time
  ctx.font = "400 14px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.letterSpacing = "1px";
  ctx.fillText(overlay.timeLabel, x, y);
  y += 22;

  // Camera info
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText(overlay.cameraLabel, x, y);

  // ── Bottom-right info ──
  ctx.textBaseline = "bottom";
  ctx.letterSpacing = "1px";
  const rx = w - 32;
  let ry = h - 24;

  // Data source
  ctx.font = "400 12px monospace";
  ctx.fillStyle = "rgba(255,255,255,0.2)";
  ctx.textAlign = "right";
  ctx.fillText("Data: Flightradar24", rx, ry);
  ry -= 22;

  // Flight count
  if (overlay.flightCount != null) {
    ctx.font = "500 14px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(`${overlay.flightCount} flights`, rx, ry);
    ry -= 22;
  }

  // Speed
  if (overlay.speed != null && overlay.speed > 1) {
    ctx.font = "500 14px monospace";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillText(`×${overlay.speed}`, rx, ry);
  }

  ctx.textAlign = "left";

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.letterSpacing = "0px";
}

/** 等待 Mapbox 完成一次渲染（最多 200ms，防止 hold still 時卡死） */
function waitForRender(map: MapboxMap): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    map.once("render", done);
    map.triggerRepaint();
    setTimeout(done, 200);
  });
}

export function useCanvasRecorder({
  map,
  fps = 30,
}: UseCanvasRecorderOptions): UseCanvasRecorderReturn {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingTime, setRecordingTime] = useState(0);
  const [hqProgress, setHqProgress] = useState<HQExportProgress | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startTimeRef = useRef(0);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeRafRef = useRef(0);
  const overlayProviderRef = useRef<OverlayProvider | null>(null);
  const hqAbortRef = useRef(false);

  // ── 取得或建立 composite canvas ──
  const getComposite = useCallback((srcCanvas: HTMLCanvasElement) => {
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    let composite = compositeCanvasRef.current;
    if (!composite) {
      composite = document.createElement("canvas");
      compositeCanvasRef.current = composite;
    }
    composite.width = w;
    composite.height = h;
    return { composite, ctx: composite.getContext("2d")!, w, h };
  }, []);

  // ── 取得最佳 codec ──
  const getBestMime = () => {
    const mimeTypes = [
      "video/webm; codecs=vp9",
      "video/webm; codecs=vp8",
      "video/webm",
    ];
    return mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  };

  // ── 下載 blob ──
  const downloadBlob = (chunks: Blob[], mimeType: string, prefix: string) => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ═══════════════════════════════════════
  // 即時錄製（原有功能）
  // ═══════════════════════════════════════

  const startRecording = useCallback(
    (getOverlay: OverlayProvider) => {
      if (!map) return;
      const srcCanvas = map.getCanvas();
      if (!srcCanvas) return;

      const { composite, ctx, w, h } = getComposite(srcCanvas);
      overlayProviderRef.current = getOverlay;

      const compositeLoop = () => {
        ctx.drawImage(srcCanvas, 0, 0);
        if (overlayProviderRef.current) {
          drawOverlay(ctx, w, h, overlayProviderRef.current());
        }
        compositeRafRef.current = requestAnimationFrame(compositeLoop);
      };
      compositeRafRef.current = requestAnimationFrame(compositeLoop);

      const mimeType = getBestMime();
      const recorder = new MediaRecorder(composite.captureStream(fps), {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        cancelAnimationFrame(compositeRafRef.current);
        downloadBlob(chunksRef.current, mimeType, "flight-arc");
        chunksRef.current = [];
        setRecordingState("idle");
        setRecordingTime(0);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setRecordingState("recording");
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    },
    [map, fps, getComposite],
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setRecordingState("stopping");
      clearInterval(timerRef.current);
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  }, []);

  // ═══════════════════════════════════════
  // HQ 離線逐幀匯出
  // ═══════════════════════════════════════

  const startHQExport = useCallback(
    (getOverlay: OverlayProvider, keyframes: CameraKeyframe[], loop: boolean, pingpong: boolean) => {
      if (!map || keyframes.length < 2) return;

      const srcCanvas = map.getCanvas();
      if (!srcCanvas) return;

      const { composite, ctx, w, h } = getComposite(srcCanvas);

      // captureStream(0) = 手動幀模式
      const stream = composite.captureStream(0);
      const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame(): void };

      const mimeType = getBestMime();
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 12_000_000, // HQ 用更高 bitrate
      });

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        downloadBlob(chunksRef.current, mimeType, "flight-arc-hq");
        chunksRef.current = [];
        setRecordingState("idle");
        setHqProgress(null);
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      hqAbortRef.current = false;
      setRecordingState("hq");
      setHqProgress({ current: 0, total: 0, percent: 0 });

      // 開始逐幀匯出
      const seqDuration = getSequenceDuration(keyframes);
      // pingpong 一個 cycle = 去 + 回 = 2× seqDuration
      const cycleDuration = pingpong ? seqDuration * 2 : seqDuration;
      const loopCount = loop ? 3 : 1;
      const totalDuration = cycleDuration * loopCount;
      const frameInterval = 1 / fps;
      const totalFrames = Math.ceil(totalDuration * fps);

      (async () => {
        for (let i = 0; i < totalFrames; i++) {
          if (hqAbortRef.current) break;

          const t = i * frameInterval;
          const cycleTime = t % cycleDuration;
          const seqTime = pingpong
            ? resolvePingpongTime(cycleTime, seqDuration)
            : cycleTime;

          // 計算並設定相機位置
          const cam = computeCameraAtTime(keyframes, seqTime);
          if (cam) {
            map.jumpTo({
              center: cam.center,
              zoom: cam.zoom,
              pitch: cam.pitch,
              bearing: cam.bearing,
            });
          }

          // 等待 Mapbox 渲染完成（Three.js 是 custom layer，同一個 render cycle）
          await waitForRender(map);

          // 合成到 composite canvas — 每幀動態取得 overlay
          ctx.drawImage(srcCanvas, 0, 0);
          drawOverlay(ctx, w, h, getOverlay());

          // 手動擷取一幀
          track.requestFrame();

          // 更新進度
          if (i % 10 === 0 || i === totalFrames - 1) {
            setHqProgress({
              current: i + 1,
              total: totalFrames,
              percent: Math.round(((i + 1) / totalFrames) * 100),
            });
          }
        }

        // 完成，停止 recorder
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
          recorderRef.current = null;
        }
      })();
    },
    [map, fps, getComposite],
  );

  const stopHQExport = useCallback(() => {
    hqAbortRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      setRecordingState("stopping");
      recorderRef.current.stop();
      recorderRef.current = null;
    }
  }, []);

  return {
    recordingState,
    recordingTime,
    startRecording,
    stopRecording,
    startHQExport,
    stopHQExport,
    hqProgress,
  };
}
