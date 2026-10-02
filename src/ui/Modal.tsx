import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../styles/ThemeContext";
import { BLUR, FONT, RADIUS, SIZE, SPACE, Z } from "../styles/tokens";
import { CloseButton, Eyebrow } from "./PanelHeader";
import { mix, themeVars } from "./vars";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  /** 底部動作列 */
  footer?: ReactNode;
  width?: number | string;
  /** 點背板關閉，預設 true */
  closeOnBackdrop?: boolean;
  /** 原地渲染、無背板、不攔 Esc（僅供活元件頁展示外殼） */
  inline?: boolean;
}

/** 置中說明視窗外殼：z modal、Esc 關閉（R7 最上層，capture 階段攔下，不往下傳）。 */
export function Modal({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  width = 480,
  closeOnBackdrop = true,
  inline = false,
}: ModalProps) {
  const { tokens } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || inline) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    boxRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, inline, onClose]);

  if (!open) return null;

  const box = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal={!inline}
      aria-label={typeof title === "string" ? title : undefined}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      className="fa-panel"
      style={{
        ...themeVars(tokens),
        position: "relative",
        width,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: inline ? undefined : "calc(100vh - 64px)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        background: tokens.panel,
        border: `1px solid ${tokens.border}`,
        borderRadius: RADIUS.base,
        backdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        WebkitBackdropFilter: `blur(${BLUR}px) saturate(1.2)`,
        color: tokens.fg1,
        fontFamily: FONT.ui,
        fontSize: SIZE.body,
        outline: "none",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: SPACE.s8,
          padding: `${SPACE.s12}px ${SPACE.s16}px ${SPACE.s8}px`,
          flex: "none",
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <div style={{ fontSize: SIZE.large, fontWeight: 500, marginTop: eyebrow ? SPACE.s4 : 0, lineHeight: 1.25 }}>{title}</div>
        </div>
        <CloseButton onClick={onClose} label="關閉說明" />
      </header>
      <div
        style={{
          padding: `0 ${SPACE.s16}px ${SPACE.s16}px`,
          overflowY: "auto",
          minHeight: 0,
          color: tokens.fg2,
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
      {footer && (
        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: SPACE.s8,
            padding: `${SPACE.s12}px ${SPACE.s16}px`,
            borderTop: `1px solid ${tokens.border}`,
            flex: "none",
          }}
        >
          {footer}
        </footer>
      )}
    </div>
  );

  if (inline) return box;

  return createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: Z.modal,
        display: "grid",
        placeItems: "center",
        background: mix(tokens.mapBg, 55),
      }}
    >
      {box}
    </div>,
    document.body,
  );
}
