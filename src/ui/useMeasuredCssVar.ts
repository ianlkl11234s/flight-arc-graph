import { useCallback, useEffect, useRef } from "react";

/**
 * 用 ResizeObserver 量元素實際高度，寫到 document.documentElement 的 CSS 變數（px）。
 * 給「別的元件要讓位」用：例如左側面板 maxHeight 依左下圖說＋時間軸的實際高度計算。
 * 回傳 callback ref：元素掛上就開始量、卸下就停（條件渲染的元素也正確）。
 * shouldWrite 回傳 false 時不寫（保留上一次的值）—— 時間軸收合時用來維持展開高度，避免面板跟著 hover 跳動。
 */
export function useMeasuredCssVar(
  varName: string,
  { enabled = true, shouldWrite }: { enabled?: boolean; shouldWrite?: () => boolean } = {},
): (el: HTMLElement | null) => void {
  const shouldWriteRef = useRef(shouldWrite);
  shouldWriteRef.current = shouldWrite;
  const roRef = useRef<ResizeObserver | null>(null);

  const attach = useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!enabled || !el || typeof ResizeObserver === "undefined") return;
    const write = () => {
      if (shouldWriteRef.current && !shouldWriteRef.current()) return;
      document.documentElement.style.setProperty(varName, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    };
    write();
    const ro = new ResizeObserver(write);
    ro.observe(el);
    roRef.current = ro;
  }, [varName, enabled]);

  useEffect(() => () => roRef.current?.disconnect(), []);
  return attach;
}
