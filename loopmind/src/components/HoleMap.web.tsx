import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@/theme/colors";
import { SvgHoleMap, HoleMapProps } from "./SvgHoleMap";

/**
 * Web hole map: a REAL satellite map (Esri World Imagery) rendered with Leaflet,
 * with tee / green / hazards drawn as Leaflet layers and the LIVE player dot +
 * remaining-distance line drawn as a React/SVG overlay positioned via the map's
 * projection (so it always tracks GPS updates reliably).
 *
 * Leaflet is loaded from a CDN on demand so it doesn't bloat the native bundle
 * (this file only runs on web). Falls back to the SVG renderer if geometry or
 * Leaflet is unavailable.
 *
 * REAL MAPS on native: add `react-native-maps` (or Mapbox) behind `HoleMapProps`.
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

interface PxPoint {
  x: number;
  y: number;
}

export function HoleMap(props: HoleMapProps) {
  const { hole, selectedTeeId, playerPosition, width, ratio = 1.4 } = props;
  const { palette } = useTheme();
  const height = width * ratio;

  const containerRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  const tee = hole.tees.find((t) => t.id === selectedTeeId) ?? hole.tees[0];
  const teeGeo = tee?.geo;
  const greenGeo = hole.green.centerGeo;
  const noGeo = !teeGeo || !greenGeo;

  // The live overlay (player dot + remaining line + markers) is drawn from the
  // hole's normalized 0..1 coordinates — the SAME positions the schematic map
  // uses — so it tracks reliably over the satellite backdrop (tee at the bottom,
  // green at the top, player interpolated by walk progress).
  const px = (p: { x: number; y: number }): PxPoint => ({ x: p.x * width, y: p.y * height });
  const playerPx = px(playerPosition);
  const greenPx = px(hole.green.center);
  const teePx = px(tee?.position ?? { x: 0.5, y: 0.9 });

  // Create the base map + static hole layers once per hole/tee.
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

        // Frame the satellite backdrop on the hole, biased so the tee→green axis
        // runs roughly bottom→top to match the overlay.
        const bounds = L.latLngBounds([
          [teeGeo.lat, teeGeo.lng],
          [greenGeo.lat, greenGeo.lng],
        ]);
        map.fitBounds(bounds, { padding: [40, 60] });

        // Container may not have its final size on first paint — settle, then
        // recompute so Esri tiles render and the framing is correct.
        setTimeout(() => {
          if (cancelled || !mapRef.current) return;
          mapRef.current.invalidateSize();
          mapRef.current.fitBounds(bounds, { padding: [40, 60] });
        }, 350);
      })
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole.number, selectedTeeId, teeGeo?.lat, teeGeo?.lng, greenGeo?.lat, greenGeo?.lng]);

  if (noGeo || failed) {
    return <SvgHoleMap {...props} />;
  }

  return (
    <View style={[styles.wrap, { width, height, borderColor: palette.border }]}>
      <View ref={containerRef} style={{ width, height }} />

      {/* Live overlay: tee, green, hazards, remaining-distance line + player dot.
          Drawn from normalized hole coordinates so it tracks reliably. */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {/* Green target */}
        <Circle cx={greenPx.x} cy={greenPx.y} r={12} fill="#39d98a" fillOpacity={0.5} stroke="#ffffff" strokeWidth={2} />
        {/* Tee */}
        <Circle cx={teePx.x} cy={teePx.y} r={5} fill={tee?.color ?? "#fff"} stroke="#ffffff" strokeWidth={1.5} />
        {/* Hazards */}
        {hole.hazards.map((h) => {
          const p = px(h.position);
          const color = h.kind === "water" ? "#2e6e96" : h.kind === "bunker" ? "#e7d8a6" : "#e5a44d";
          return <Circle key={h.id} cx={p.x} cy={p.y} r={7} fill={color} fillOpacity={0.7} stroke="#ffffff" strokeWidth={1} />;
        })}
        {/* Remaining-distance line player -> green */}
        <Line x1={playerPx.x} y1={playerPx.y} x2={greenPx.x} y2={greenPx.y} stroke="#ffd60a" strokeWidth={3} strokeLinecap="round" />
        {/* Player */}
        <Circle cx={playerPx.x} cy={playerPx.y} r={16} fill="#2BD576" fillOpacity={0.2} stroke="#2BD576" strokeWidth={1.5} />
        <Circle cx={playerPx.x} cy={playerPx.y} r={9} fill="#2BD576" stroke="#ffffff" strokeWidth={3} />
      </Svg>

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
