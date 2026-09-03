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

/** Phase 1-4 驗收用：一幀的像素統計（平均亮度、非黑像素比例） */
export interface FrameCaptureStats {
  avgBrightness: number;
  nonBlackRatio: number;
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
  /**
   * Phase 1-4 驗收用：走與即時錄製完全相同的取像程式碼路徑（"render" 事件內
   * 同步 drawImage）取一幀，回傳像素統計。不落地成檔案。DEV-only 掛鉤用。
   */
  captureFrameForTest: () => Promise<FrameCaptureStats | null>;
  /**
   * Phase 1-4 驗收用：走與 HQ 匯出完全相同的取像程式碼路徑（`waitForRender` +
   * 同步 drawImage）取一幀，回傳像素統計。不落地成檔案。DEV-only 掛鉤用。
   */
  captureHQFrameForTest: () => Promise<FrameCaptureStats | null>;
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

/**
 * 把 srcCanvas 目前內容同步畫進 composite canvas（可選疊 overlay）。
 * ⚠️ 呼叫時機是安全與否的關鍵：`preserveDrawingBuffer:false` 之後，drawing
 * buffer 只保證在 Mapbox 的 "render" 事件的同一個 tick 內同步呼叫才有內容
 * （WebGL 規格：compositing 後 buffer 可能被清空；不同步呼叫可能讀到黑畫面）。
 * 所有呼叫端必須在 "render" 事件 handler 內同步呼叫（或緊接在其 microtask
 * 續行內，如 `waitForRender` 的 HQ 匯出路徑）。
 */
function captureFrame(
  ctx: CanvasRenderingContext2D,
  srcCanvas: HTMLCanvasElement,
  w: number,
  h: number,
  overlay?: RecordingOverlay,
) {
  ctx.drawImage(srcCanvas, 0, 0);
  if (overlay) drawOverlay(ctx, w, h, overlay);
}

/** Phase 1-4 驗收用：取樣 composite canvas 目前內容，算平均亮度與非黑像素比例 */
function analyzeFrame(ctx: CanvasRenderingContext2D, w: number, h: number): FrameCaptureStats {
  if (w === 0 || h === 0) return { avgBrightness: 0, nonBlackRatio: 0 };
  const { data } = ctx.getImageData(0, 0, w, h);
  // 取樣間隔（非逐 pixel，避免大畫布掃描太貴；47 與 4-byte stride 互質，取樣分佈均勻）
  const step = 4 * 47;
  let sum = 0;
  let nonBlack = 0;
  let n = 0;
  for (let i = 0; i + 2 < data.length; i += step) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = (r + g + b) / 3;
    sum += lum;
    if (lum > 4) nonBlack++;
    n++;
  }
  return { avgBrightness: n > 0 ? sum / n : 0, nonBlackRatio: n > 0 ? nonBlack / n : 0 };
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

      // Phase 1-4：改掛在 Mapbox 的 "render" 事件上、同步取像（見 captureFrame
      // 上方註解）。原本獨立的 rAF 迴圈在 preserveDrawingBuffer:false 下讀取
      // 時機與 Mapbox 實際繪製不同步，可能讀到已清空的黑畫面。
      const onRender = () => {
        captureFrame(ctx, srcCanvas, w, h, overlayProviderRef.current?.());
      };
      map.on("render", onRender);
      // 錄製開始當下地圖可能正閒置（Phase 1-2 節流器降頻/停止），強制一次
      // render 讓 composite canvas 立刻有內容，不必等到下一次真正互動才畫出東西。
      map.triggerRepaint();

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
        map.off("render", onRender);
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
          captureFrame(ctx, srcCanvas, w, h, getOverlay());

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

  // ═══════════════════════════════════════
  // Phase 1-4 驗收用：不落地成檔案，直接量測取像路徑的像素內容
  // ═══════════════════════════════════════

  /** 即時錄製取像路徑："render" 事件內同步 drawImage（與 startRecording 的 onRender 完全同一段程式碼）*/
  const captureFrameForTest = useCallback((): Promise<FrameCaptureStats | null> => {
    if (!map) return Promise.resolve(null);
    const srcCanvas = map.getCanvas();
    if (!srcCanvas) return Promise.resolve(null);
    const { ctx, w, h } = getComposite(srcCanvas);
    return new Promise((resolve) => {
      map.once("render", () => {
        captureFrame(ctx, srcCanvas, w, h);
        resolve(analyzeFrame(ctx, w, h));
      });
      map.triggerRepaint();
    });
  }, [map, getComposite]);

  /** HQ 匯出取像路徑：`waitForRender` 之後同步呼叫 `captureFrame`（與 startHQExport 迴圈內完全同一段程式碼）*/
  const captureHQFrameForTest = useCallback(async (): Promise<FrameCaptureStats | null> => {
    if (!map) return null;
    const srcCanvas = map.getCanvas();
    if (!srcCanvas) return null;
    const { ctx, w, h } = getComposite(srcCanvas);
    await waitForRender(map);
    captureFrame(ctx, srcCanvas, w, h);
    return analyzeFrame(ctx, w, h);
  }, [map, getComposite]);

  return {
    recordingState,
    recordingTime,
    startRecording,
    stopRecording,
    startHQExport,
    stopHQExport,
    hqProgress,
    captureFrameForTest,
    captureHQFrameForTest,
  };
}
