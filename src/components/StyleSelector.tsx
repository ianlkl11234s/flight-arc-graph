import type { MapStyle } from "../types";
import { Select } from "../ui";

export const MAP_STYLES: MapStyle[] = [
  { id: "dark", name: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  // Pure Black 與 Dark 共用 dark-v11，靠 MapView 的 paint override 壓成純黑
  { id: "black", name: "Pure Black", url: "mapbox://styles/mapbox/dark-v11" },
  { id: "light", name: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { id: "satellite", name: "Satellite", url: "mapbox://styles/mapbox/satellite-v9" },
  { id: "satellite-streets", name: "Satellite Streets", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { id: "nav-night", name: "Navigation Night", url: "mapbox://styles/mapbox/navigation-night-v1" },
  { id: "streets", name: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
];

interface Props {
  selected: string;
  /** 舊介面相容；取色已改走 useTheme().tokens */
  isDarkTheme?: boolean;
  onChange: (styleId: string) => void;
  width?: number | string;
}

/** 底圖下拉（選項 >3 → ui/Select）。 */
export function StyleSelector({ selected, onChange, width }: Props) {
  return (
    <Select<string>
      ariaLabel="底圖"
      title="底圖"
      width={width}
      options={MAP_STYLES.map((s) => ({ value: s.id, label: s.name }))}
      value={selected}
      onChange={onChange}
    />
  );
}

export function getStyleUrl(id: string): string {
  return MAP_STYLES.find((s) => s.id === id)?.url ?? MAP_STYLES[0]!.url;
}
