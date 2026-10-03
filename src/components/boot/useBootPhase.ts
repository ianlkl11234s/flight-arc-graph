import { useEffect, useState } from "react";
import {
  bootAttrFor,
  initBoot,
  setBootAttr,
  setBootScale,
  stepBoot,
  type BootSignals,
  type BootState,
} from "./bootSequence";

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * 把 bootSequence 狀態機接到 React：依訊號與計時器推進 phase，並同步 <html data-boot> 與 --boot-k。
 * startedAt 在第一次 render 取得（StrictMode 重掛不會重設），最少顯示時間從這裡起算。
 */
export function useBootPhase(signals: BootSignals, minShowMs: number, enterScale: number): BootState & { reducedMotion: boolean } {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [state, setState] = useState<BootState>(() => initBoot(performance.now()));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const step = stepBoot(state, signals, performance.now(), { minShowMs, enterScale, reducedMotion });
    if (step.state !== state) {
      setState(step.state);
      return;
    }
    if (step.wakeInMs === null) return;
    const id = window.setTimeout(() => setTick((n) => n + 1), step.wakeInMs + 1);
    return () => window.clearTimeout(id);
  }, [state, signals.mapReady, signals.dataSettled, minShowMs, enterScale, reducedMotion, tick]);

  useEffect(() => {
    setBootScale(enterScale);
  }, [enterScale]);

  useEffect(() => {
    setBootAttr(bootAttrFor(state.phase));
  }, [state.phase]);

  return { ...state, reducedMotion };
}
