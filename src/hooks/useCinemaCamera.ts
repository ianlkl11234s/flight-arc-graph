import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";

export type CinemaMode = "off" | "orbit" | "sequence";
export type EasingType = "ease-in-out" | "linear" | "ease-out";
export type CinemaPhase = "edit" | "play";

export interface CameraKeyframe {
  id: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  duration: number;
  easing: EasingType;
  hold?: {
    type: "still" | "orbit";
    duration: number;
    speed?: number;
    direction?: 1 | -1;
  };
}

interface UseCinemaCameraOptions {
  map: MapboxMap | null;
  active: boolean;
}

interface UseCinemaCameraReturn {
  cinemaMode: CinemaMode;
  setCinemaMode: (mode: CinemaMode) => void;
  orbitSpeed: number;
  setOrbitSpeed: (speed: number) => void;
  orbitDirection: 1 | -1;
  setOrbitDirection: (dir: 1 | -1) => void;
  // Keyframe system
  keyframes: CameraKeyframe[];
  cinemaPhase: CinemaPhase;
  addKeyframe: () => void;
  removeKeyframe: (id: string) => void;
  updateKeyframe: (id: string, updates: Partial<CameraKeyframe>) => void;
  moveKeyframe: (id: string, direction: -1 | 1) => void;
  previewKeyframe: (id: string) => void;
  playSequence: () => void;
  stopSequence: () => void;
  sequenceProgress: number;
  currentKfIndex: number;
}

// --- Pure helpers (module scope) ---

function applyEasing(t: number, easing: EasingType): number {
  switch (easing) {
    case "linear":
      return t;
    case "ease-out":
      return 1 - Math.pow(1 - t, 3);
    case "ease-in-out":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return a + diff * t;
}

function getTotalDuration(kfs: CameraKeyframe[]): number {
  let total = 0;
  for (let i = 0; i < kfs.length - 1; i++) {
    total += kfs[i]!.duration;
    if (kfs[i]!.hold) total += kfs[i]!.hold!.duration;
  }
  const last = kfs[kfs.length - 1];
  if (last?.hold) total += last.hold.duration;
  return total;
}

// --- Hook ---

export function useCinemaCamera({ map, active }: UseCinemaCameraOptions): UseCinemaCameraReturn {
  const [cinemaMode, setCinemaMode] = useState<CinemaMode>("off");
  const [orbitSpeed, setOrbitSpeed] = useState(2);
  const [orbitDirection, setOrbitDirection] = useState<1 | -1>(1);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Keyframe state
  const [keyframes, setKeyframes] = useState<CameraKeyframe[]>([]);
  const [cinemaPhase, setCinemaPhase] = useState<CinemaPhase>("edit");
  const [sequenceProgress, setSequenceProgress] = useState(0);
  const [currentKfIndex, setCurrentKfIndex] = useState(0);
  const seqRafRef = useRef<number>(0);
  const seqStartRef = useRef<number>(0);
  const kfCounter = useRef(0);

  // --- Orbit RAF ---
  useEffect(() => {
    if (!map || !active || cinemaMode !== "orbit") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return;
    }

    const animate = (now: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const currentBearing = map.getBearing();
      map.setBearing(currentBearing + orbitSpeed * orbitDirection * dt);

      rafRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, active, cinemaMode, orbitSpeed, orbitDirection]);

  // --- Keyframe operations ---

  const addKeyframe = useCallback(() => {
    if (!map) return;
    const c = map.getCenter();
    const kf: CameraKeyframe = {
      id: `kf-${Date.now()}-${kfCounter.current++}`,
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      pitch: map.getPitch(),
      bearing: map.getBearing(),
      duration: 3,
      easing: "ease-in-out",
    };
    setKeyframes(prev => [...prev, kf]);
  }, [map]);

  const removeKeyframe = useCallback((id: string) => {
    setKeyframes(prev => prev.filter(k => k.id !== id));
  }, []);

  const updateKeyframe = useCallback((id: string, updates: Partial<CameraKeyframe>) => {
    setKeyframes(prev => prev.map(k => (k.id === id ? { ...k, ...updates } : k)));
  }, []);

  const moveKeyframe = useCallback((id: string, direction: -1 | 1) => {
    setKeyframes(prev => {
      const idx = prev.findIndex(k => k.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx]!, arr[idx]!];
      return arr;
    });
  }, []);

  const previewKeyframe = useCallback(
    (id: string) => {
      if (!map) return;
      const kf = keyframes.find(k => k.id === id);
      if (!kf) return;
      map.jumpTo({
        center: kf.center,
        zoom: kf.zoom,
        pitch: kf.pitch,
        bearing: kf.bearing,
      });
    },
    [map, keyframes],
  );

  // --- Sequence playback ---

  const playSequence = useCallback(() => {
    if (keyframes.length < 2) return;
    setCinemaMode("sequence");
    setCinemaPhase("play");
    setSequenceProgress(0);
    setCurrentKfIndex(0);
    seqStartRef.current = 0;
    if (map) {
      const first = keyframes[0]!;
      map.jumpTo({
        center: first.center,
        zoom: first.zoom,
        pitch: first.pitch,
        bearing: first.bearing,
      });
    }
  }, [keyframes, map]);

  const stopSequence = useCallback(() => {
    setCinemaPhase("edit");
    seqStartRef.current = 0;
    if (seqRafRef.current) cancelAnimationFrame(seqRafRef.current);
  }, []);

  // --- Sequence RAF ---
  useEffect(() => {
    if (!map || !active || cinemaMode !== "sequence" || cinemaPhase !== "play" || keyframes.length < 2) {
      if (seqRafRef.current) cancelAnimationFrame(seqRafRef.current);
      return;
    }

    const totalDur = getTotalDuration(keyframes);

    const animate = (now: number) => {
      if (seqStartRef.current === 0) seqStartRef.current = now;
      const elapsed = (now - seqStartRef.current) / 1000;

      if (elapsed >= totalDur) {
        setCinemaPhase("edit");
        setSequenceProgress(1);
        setCurrentKfIndex(keyframes.length - 1);
        seqStartRef.current = 0;
        return;
      }

      setSequenceProgress(elapsed / totalDur);

      let cumulative = 0;
      for (let i = 0; i < keyframes.length; i++) {
        const kf = keyframes[i]!;

        // Transition phase (not last keyframe)
        if (i < keyframes.length - 1) {
          const dur = kf.duration;
          if (elapsed < cumulative + dur) {
            const t = (elapsed - cumulative) / dur;
            const eased = applyEasing(t, kf.easing);
            const next = keyframes[i + 1]!;

            setCurrentKfIndex(i);
            map.jumpTo({
              center: [
                kf.center[0] + (next.center[0] - kf.center[0]) * eased,
                kf.center[1] + (next.center[1] - kf.center[1]) * eased,
              ],
              zoom: kf.zoom + (next.zoom - kf.zoom) * eased,
              pitch: kf.pitch + (next.pitch - kf.pitch) * eased,
              bearing: lerpAngle(kf.bearing, next.bearing, eased),
            });

            seqRafRef.current = requestAnimationFrame(animate);
            return;
          }
          cumulative += dur;
        }

        // Hold phase
        if (kf.hold) {
          if (elapsed < cumulative + kf.hold.duration) {
            setCurrentKfIndex(i);
            if (kf.hold.type === "orbit") {
              const holdElapsed = elapsed - cumulative;
              const holdSpeed = kf.hold.speed ?? 2;
              const holdDir = kf.hold.direction ?? 1;
              map.jumpTo({
                center: kf.center,
                zoom: kf.zoom,
                pitch: kf.pitch,
                bearing: kf.bearing + holdSpeed * holdDir * holdElapsed,
              });
            }
            // still: camera stays put

            seqRafRef.current = requestAnimationFrame(animate);
            return;
          }
          cumulative += kf.hold.duration;
        }
      }

      seqRafRef.current = requestAnimationFrame(animate);
    };

    seqStartRef.current = 0;
    seqRafRef.current = requestAnimationFrame(animate);

    return () => {
      if (seqRafRef.current) cancelAnimationFrame(seqRafRef.current);
    };
  }, [map, active, cinemaMode, cinemaPhase, keyframes]);

  // --- Reset on deactivate ---
  useEffect(() => {
    if (!active) {
      setCinemaMode("off");
      setCinemaPhase("edit");
      // Keep keyframes for next session
    }
  }, [active]);

  return {
    cinemaMode,
    setCinemaMode,
    orbitSpeed,
    setOrbitSpeed,
    orbitDirection,
    setOrbitDirection,
    // Keyframe system
    keyframes,
    cinemaPhase,
    addKeyframe,
    removeKeyframe,
    updateKeyframe,
    moveKeyframe,
    previewKeyframe,
    playSequence,
    stopSequence,
    sequenceProgress,
    currentKfIndex,
  };
}
