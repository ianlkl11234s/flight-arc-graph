import type { Flight, Scope, TrackMode } from "../types";
import { SPACE } from "../styles/tokens";
import { Segmented, Select } from "../ui";

interface Props {
  flights: Flight[];
  scope: Scope;
  trackMode: TrackMode;
  selectedFlightId: string | null;
  onScopeChange: (scope: Scope) => void;
  onTrackModeChange: (mode: TrackMode) => void;
  onFlightSelect: (id: string | null) => void;
}

/** 手機底部抽屜用：範圍／追蹤模式（兩組 Segmented）+ Track Single 時的航班下拉。 */
export function FlightPicker({
  flights,
  scope,
  trackMode,
  selectedFlightId,
  onScopeChange,
  onTrackModeChange,
  onFlightSelect,
}: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: SPACE.s6 }}>
      <Segmented<Scope>
        ariaLabel="範圍"
        fullWidth
        options={[
          { value: "airport", label: "This Airport" },
          { value: "region", label: "Region" },
        ]}
        value={scope}
        onChange={onScopeChange}
      />
      <Segmented<TrackMode>
        ariaLabel="追蹤模式"
        fullWidth
        options={[
          { value: "stack", label: "Stack All" },
          { value: "single", label: "Track Single" },
        ]}
        value={trackMode}
        onChange={(m) => {
          onTrackModeChange(m);
          if (m !== "single") onFlightSelect(null);
        }}
      />
      {trackMode === "single" && (
        <div>
          <Select<string>
            ariaLabel="航班"
            fullWidth
            placeholder="Select flight..."
            options={flights.map((f) => ({
              value: f.fr24_id,
              label: `${f.callsign} (${f.origin_iata}→${f.dest_iata}) ${f.aircraft_type}`,
            }))}
            value={selectedFlightId}
            onChange={onFlightSelect}
          />
        </div>
      )}
    </div>
  );
}
