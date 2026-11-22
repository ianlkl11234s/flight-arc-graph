import { SPACE, Z } from "../styles/tokens";
import { Button, StatusBar } from "../ui";
import { BELOW_TOOLBAR } from "./Toolbar";

interface PlaneNoticeProps {
  /** 投影已選、但目前的檢視沒有單一中心點（組合／區域／空域資料／機場總覽）→ 顯示 */
  show: boolean;
  /** 目前檢視的白話說明，例：「組合檢視」 */
  reason: string;
  onDisable: () => void;
  top?: number;
  right?: number;
}

/** 與 LoadingStatus、BudgetNotice 同一欄，排在它們下面（各佔一條 StatusBar 的高度） */
const STACK_OFFSET = (28 + SPACE.s8) * 2;

/**
 * 方位投影暫停提示：方位投影以單一機場為中心，切到多機場的檢視時投影會暫停、
 * 畫面回到標準地圖。不講的話使用者只會看到「投影突然不見了」。
 */
export function PlaneNotice({ show, reason, onDisable, top = BELOW_TOOLBAR, right = SPACE.s16 }: PlaneNoticeProps) {
  if (!show) return null;
  return (
    <div style={{ position: "absolute", top: top + STACK_OFFSET, right, zIndex: Z.toast, maxWidth: 420 }}>
      <StatusBar
        state="empty"
        message="方位投影已暫停"
        detail={`${reason}沒有單一中心點`}
        action={<Button variant="ghost" onClick={onDisable}>關閉投影</Button>}
      />
    </div>
  );
}
