import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl";

export type CinemaMode = "off" | "orbit";

interface UseCinemaCameraOptions {
  map: MapboxMap | null;
  active: boolean;
}

interface UseCinemaCameraReturn {
  cinemaMode: CinemaMode;
  setCinemaMode: (mode: CinemaMode) => void;
  orbitSpeed: number;
  setOrbitSpeed: (speed: number) => void;
  orbitDirection: 1 | -1;
  setOrbitDirection: (dir: 1 | -1) => void;
}

export function useCinemaCamera({ map, active }: UseCinemaCameraOptions): UseCinemaCameraReturn {
  const [cinemaMode, setCinemaMode] = useState<CinemaMode>("off");
  const [orbitSpeed, setOrbitSpeed] = useState(2);
  const [orbitDirection, setOrbitDirection] = useState<1 | -1>(1);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !active || cinemaMode !== "orbit") {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = 0;
      return;
    }

    const animate = (now: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = now;
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      const currentBearing = map.getBearing();
      map.setBearing(currentBearing + orbitSpeed * orbitDirection * dt);

      rafRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [map, active, cinemaMode, orbitSpeed, orbitDirection]);

  useEffect(() => {
    if (!active) {
      setCinemaMode("off");
    }
  }, [active]);

  return {
    cinemaMode,
    setCinemaMode,
    orbitSpeed,
    setOrbitSpeed,
    orbitDirection,
    setOrbitDirection,
  };
}
