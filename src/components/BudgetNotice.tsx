import { SPACE, Z } from "../styles/tokens";
import { Button, StatusBar } from "../ui";
import type { MemoryBudgetStatus } from "../hooks/useFlightData";
import { BELOW_TOOLBAR } from "./Toolbar";

interface BudgetNoticeProps {
  status: MemoryBudgetStatus | null;
  onConfirm: () => void;
  /** 位置（預設：桌機右上工具列下方，與 LoadingStatus 同一欄） */
  top?: number;
  right?: number;
  hidden?: boolean;
}

/** LoadingStatus 的 StatusBar 最小高 28 + 間距；自動降解析度時兩條會同時出現 */
const STACK_OFFSET = 28 + SPACE.s8;

/**
 * 軌跡記憶體預算的提示（memoryBudget.ts）。
 * - blocked：範圍過大、未載入，按「仍要載入」才載（以最粗的 L2）
 * - capped：已自動改用較粗的軌跡解析度，常駐顯示直到範圍變小
 */
export function BudgetNotice({ status, onConfirm, top = BELOW_TOOLBAR, right = SPACE.s16, hidden = false }: BudgetNoticeProps) {
  if (!status || hidden) return null;
  const est = `約 ${Math.round(status.estMB).toLocaleString()} MB`;
  return (
    <div
      style={{
        position: "absolute",
        // blocked 時 LoadingStatus 不畫，佔它的位置；capped 時排在它下面
        top: status.blocked ? top : top + STACK_OFFSET,
        right,
        zIndex: Z.toast,
        maxWidth: 360,
      }}
    >
      {status.blocked ? (
        <StatusBar
          state="empty"
          message="範圍過大，尚未載入"
          detail={`預估${est}`}
          action={<Button variant="ghost" onClick={onConfirm}>仍要載入</Button>}
        />
      ) : (
        <StatusBar state="empty" message="已降低軌跡解析度以控制記憶體" detail={status.lod.toUpperCase()} />
      )}
    </div>
  );
}
