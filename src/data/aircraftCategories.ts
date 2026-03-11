import type { Flight } from "../types";

export type AircraftCategory =
  | "military"
  | "business-jet"
  | "helicopter"
  | "training"
  | "china-domestic";

export const AIRCRAFT_CATEGORIES: Record<
  AircraftCategory,
  { label: string; types: string[] }
> = {
  military: {
    label: "Military",
    types: ["P8", "P3", "F50", "DRON"],
  },
  "business-jet": {
    label: "Business Jet",
    types: [
      "GLF4", "GLF5", "GLF6", "GL7T", "GL5T", "GLEX", "G280", "GA7C",
      "CL35", "CL60", "FA8X", "F2TH", "C56X", "C25C", "C25M", "ASTR",
    ],
  },
  helicopter: {
    label: "Helicopter",
    types: ["A169", "B407"],
  },
  training: {
    label: "Training",
    types: ["DA40", "DA42"],
  },
  "china-domestic": {
    label: "China Domestic",
    types: ["C919", "AJ27", "SU95"],
  },
};

/** 所有特殊機型（非一般客機） */
const ALL_SPECIAL_TYPES = new Set(
  Object.values(AIRCRAFT_CATEGORIES).flatMap((c) => c.types),
);

export type AircraftFilterKey =
  | "all"
  | "all-special"
  | `cat:${AircraftCategory}`
  | `type:${string}`;

export function filterByAircraftType(
  flights: Flight[],
  key: AircraftFilterKey,
): Flight[] {
  if (key === "all") return flights;

  if (key === "all-special") {
    return flights.filter((f) => ALL_SPECIAL_TYPES.has(f.aircraft_type));
  }

  if (key.startsWith("cat:")) {
    const cat = key.slice(4) as AircraftCategory;
    const allowed = new Set(AIRCRAFT_CATEGORIES[cat].types);
    return flights.filter((f) => allowed.has(f.aircraft_type));
  }

  if (key.startsWith("type:")) {
    const type = key.slice(5);
    return flights.filter((f) => f.aircraft_type === type);
  }

  return flights;
}
