import type { Flight } from "../types";
import { altitudeAt } from "../data/flightAltitude";
import { Button, DockCard } from "../ui";

/** 台灣時間 MM/DD HH:MM；0／缺值回 null（DockCard 顯示「—」，R9） */
function formatTW(t: number | undefined): string | null {
  if (!t || t <= 0) return null;
  const tw = new Date(t * 1000 + 8 * 3600_000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(tw.getUTCMonth() + 1)}/${p2(tw.getUTCDate())} ${p2(tw.getUTCHours())}:${p2(tw.getUTCMinutes())}`;
}

interface FlightInfoCardProps {
  flight: Flight;
  /** 目前播放時刻（unix 秒），算目前高度 */
  currentTime: number;
  /** 正在追蹤這班（單航班模式） */
  tracking: boolean;
  onTrack: () => void;
  onStopTrack: () => void;
  onClose: () => void;
}

/** 右下 dock 航班卡（spec R1、Q5）：單擊航班出現；「追蹤這班」才進單航班模式。 */
export function FlightInfoCard({ flight, currentTime, tracking, onTrack, onStopTrack, onClose }: FlightInfoCardProps) {
  const alt = altitudeAt(flight.path, currentTime);
  const route = `${flight.origin_iata || flight.origin_icao || "—"} → ${flight.dest_iata || flight.dest_icao || "—"}`;
  return (
    <DockCard
      eyebrow={tracking ? "TRACKING · 追蹤中" : "FLIGHT · 航班"}
      title={flight.callsign || flight.flight_number || "—"}
      subtitle={route}
      kv={[
        { label: "機型", value: flight.aircraft_type || null },
        { label: "目前高度", value: alt !== null ? `${alt.toLocaleString()} m` : null },
        { label: "起飛", value: formatTW(flight.dep_time) },
        { label: "落地", value: formatTW(flight.arr_time) },
      ]}
      actions={
        tracking
          ? <Button width={96} onClick={onStopTrack}>停止追蹤</Button>
          : <Button variant="primary" width={96} onClick={onTrack}>追蹤這班</Button>
      }
      onClose={onClose}
      closeLabel="關閉航班資訊"
    />
  );
}
