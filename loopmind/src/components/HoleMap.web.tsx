import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@/theme/colors";
import { SvgHoleMap, HoleMapProps } from "./SvgHoleMap";

/**
 * Web hole map: a REAL satellite map (Esri World Imagery) rendered with Leaflet,
 * with the tee, green, hazards and the live player position plotted on actual
 * ground imagery. This replaces the stylized SVG flyover on web.
 *
 * Leaflet is loaded from a CDN on demand so it doesn't bloat the native bundle
 * (this file only runs on web). If geometry or Leaflet is unavailable we fall
 * back to the SVG renderer so the screen always shows something.
 *
 * REAL MAPS on native: add `react-native-maps` (or a Mapbox component) behind
 * the same `HoleMapProps` to get satellite imagery in the iOS/Android builds.
 */

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

declare global {
  interface Window {
    L?: any;
  }
}

let leafletPromise: Promise<any> | null = null;
function loadLeaflet(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("Failed to load Leaflet"));
    document.body.appendChild(script);
  });
  return leafletPromise;
}

export function HoleMap(props: HoleMapProps) {
  const { hole, selectedTeeId, playerGeo, width, ratio = 1.4 } = props;
  const { palette } = useTheme();
  const height = width * ratio;

  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const playerMarkerRef = useRef<any>(null);
  const playerHaloRef = useRef<any>(null);
  const remainingLineRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const tee = hole.tees.find((t) => t.id === selectedTeeId) ?? hole.tees[0];
  const teeGeo = tee?.geo;
  const greenGeo = hole.green.centerGeo;
  const noGeo = !teeGeo || !greenGeo;

  // Initialize the map once we have geometry.
  useEffect(() => {
    let cancelled = false;
    if (!teeGeo || !greenGeo) return;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        // Fully non-interactive: the map is a rangefinder *view*, so it must not
        // hijack page scroll / touch (otherwise content below it is unreachable).
        const map = L.map(containerRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          scrollWheelZoom: false,
          doubleClickZoom: false,
          touchZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false,
        });
        mapRef.current = map;
        L.tileLayer(ESRI_IMAGERY, { maxZoom: 21, maxNativeZoom: 19 }).addTo(map);

        // Green
        L.circle([greenGeo.lat, greenGeo.lng], {
          radius: 12,
          color: "#ffffff",
          weight: 2,
          fillColor: "#39d98a",
          fillOpacity: 0.55,
        }).addTo(map);
        // Pin
        L.circleMarker([greenGeo.lat, greenGeo.lng], { radius: 3, color: "#ff3b30", fillColor: "#ff3b30", fillOpacity: 1 }).addTo(map);

        // Tee
        L.circleMarker([teeGeo.lat, teeGeo.lng], {
          radius: 6,
          color: "#ffffff",
          weight: 2,
          fillColor: tee.color,
          fillOpacity: 1,
        }).addTo(map);

        // Hazards
        hole.hazards.forEach((h) => {
          if (!h.geo) return;
          const color = h.kind === "water" ? "#2e6e96" : h.kind === "bunker" ? "#e7d8a6" : "#e5a44d";
          L.circle([h.geo.lat, h.geo.lng], {
            radius: 8,
            color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.6,
          }).addTo(map);
        });

        // Aim line tee -> green
        L.polyline(
          [
            [teeGeo.lat, teeGeo.lng],
            [greenGeo.lat, greenGeo.lng],
          ],
          { color: "#2BD576", weight: 2, dashArray: "6 8", opacity: 0.9 },
        ).addTo(map);

        const bounds = L.latLngBounds([
          [teeGeo.lat, teeGeo.lng],
          [greenGeo.lat, greenGeo.lng],
        ]);
        hole.hazards.forEach((h) => h.geo && bounds.extend([h.geo.lat, h.geo.lng]));
        map.fitBounds(bounds, { padding: [28, 28] });

        // The container may not have its final size on first paint (react-native-web
        // layout timing), which can leave tiles unrendered (black). Recompute size
        // shortly after mount so Esri tiles load reliably.
        setTimeout(() => {
          if (!cancelled && mapRef.current) {
            mapRef.current.invalidateSize();
            mapRef.current.fitBounds(bounds, { padding: [28, 28] });
          }
        }, 300);
        if (!cancelled) setMapReady(true);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      setMapReady(false);
      playerMarkerRef.current = null;
      playerHaloRef.current = null;
      remainingLineRef.current = null;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // Re-init when the hole or tee changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole.number, selectedTeeId, teeGeo?.lat, teeGeo?.lng, greenGeo?.lat, greenGeo?.lng]);

  // Update the live player marker + remaining-distance line (clearly shows
  // progress as the player walks). Runs once the map is ready and on each move.
  useEffect(() => {
    const L = window.L;
    const map = mapRef.current;
    if (!L || !map || !mapReady || !playerGeo) return;
    const pos: [number, number] = [playerGeo.lat, playerGeo.lng];

    if (!playerHaloRef.current) {
      playerHaloRef.current = L.circleMarker(pos, {
        radius: 16,
        color: "#2BD576",
        weight: 2,
        fillColor: "#2BD576",
        fillOpacity: 0.2,
      }).addTo(map);
    } else {
      playerHaloRef.current.setLatLng(pos);
    }

    if (!playerMarkerRef.current) {
      playerMarkerRef.current = L.circleMarker(pos, {
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: "#2BD576",
        fillOpacity: 1,
      }).addTo(map);
    } else {
      playerMarkerRef.current.setLatLng(pos);
    }

    if (greenGeo) {
      const line: [number, number][] = [pos, [greenGeo.lat, greenGeo.lng]];
      if (!remainingLineRef.current) {
        remainingLineRef.current = L.polyline(line, {
          color: "#ffd60a",
          weight: 3,
          opacity: 0.95,
        }).addTo(map);
      } else {
        remainingLineRef.current.setLatLngs(line);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerGeo?.lat, playerGeo?.lng, mapReady]);

  if (noGeo || failed) {
    // Geometry or Leaflet unavailable — fall back to the SVG renderer.
    return <SvgHoleMap {...props} />;
  }

  return (
    <View style={[styles.wrap, { width, height, borderColor: palette.border }]}>
      <View ref={containerRef} style={{ width, height }} />
      <View style={[styles.badge, { pointerEvents: "none" }]}>
        <Text style={styles.badgeText}>Satellite · live</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
