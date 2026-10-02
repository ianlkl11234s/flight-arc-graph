/** src/ui 內部用的小圖示（不用「×」「▶」「▼」字元）。 */

export function IconClose({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true">
      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
    </svg>
  );
}

export function IconChevron({ size = 10, direction = "down" }: { size?: number; direction?: "down" | "right" | "up" | "left" }) {
  const rot = direction === "down" ? 0 : direction === "right" ? -90 : direction === "left" ? 90 : 180;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      aria-hidden="true"
      style={{ transform: `rotate(${rot}deg)`, transition: "transform .15s", flex: "none" }}
    >
      <path d="M2 3.5l3 3 3-3" />
    </svg>
  );
}

export function IconPlay({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5v7l6-3.5z" />
    </svg>
  );
}

export function IconPause({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M2.5 1.5h1.8v7H2.5zM5.7 1.5h1.8v7H5.7z" />
    </svg>
  );
}

export function IconPlus({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true">
      <path d="M5 1.5v7M1.5 5h7" />
    </svg>
  );
}

export function IconMinus({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true">
      <path d="M1.5 5h7" />
    </svg>
  );
}
