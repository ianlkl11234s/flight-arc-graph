import { getAirportInfo } from "../map/cameraPresets";
import { Select } from "../ui";

interface Props {
  airports: string[];
  selected: string;
  onChange: (icao: string) => void;
}

/** 機場下拉（選項 >3 → ui/Select）。手機 header 內可收縮：機場全名過長時不把右側按鈕擠出畫面。 */
export function AirportSelector({ airports, selected, onChange }: Props) {
  return (
    <div style={{ flex: "0 1 auto", minWidth: 0, display: "flex" }}>
      <Select<string>
        ariaLabel="機場"
        fullWidth
        options={airports.map((icao) => {
          const info = getAirportInfo(icao);
          return { value: icao, label: info ? `${info.name} (${icao})` : icao };
        })}
        value={selected}
        onChange={onChange}
      />
    </div>
  );
}
