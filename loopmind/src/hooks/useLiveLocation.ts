import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { GeoPoint } from "@/types/models";

interface LiveLocation {
  coordinate: GeoPoint | null;
  /** Reported horizontal accuracy in meters (if available). */
  accuracyM: number | null;
  tracking: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Push a synthetic coordinate (used by the "simulate walk" demo mode). */
  pushSimulated: (point: GeoPoint, accuracyM?: number) => void;
}

/**
 * Live GPS tracking via `expo-location.watchPositionAsync`. On the web this uses
 * the browser Geolocation API (requires HTTPS — the app's public tunnel link is
 * HTTPS, so it works on a phone browser). Falls back gracefully if permission is
 * denied; the caller can still drive `pushSimulated` for a desktop demo.
 */
export function useLiveLocation(): LiveLocation {
  const [coordinate, setCoordinate] = useState<GeoPoint | null>(null);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const stop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setTracking(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setError("Location permission denied — use Simulate to preview live tracking.");
        return;
      }
      setTracking(true);
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2, timeInterval: 2000 },
        (loc) => {
          setCoordinate({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setAccuracyM(loc.coords.accuracy ?? null);
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start GPS tracking.");
      setTracking(false);
    }
  }, []);

  const pushSimulated = useCallback((point: GeoPoint, acc = 4) => {
    setCoordinate(point);
    setAccuracyM(acc);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { coordinate, accuracyM, tracking, error, start, stop, pushSimulated };
}
