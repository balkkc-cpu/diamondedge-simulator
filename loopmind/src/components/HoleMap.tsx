import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@/theme/colors";
import { GeoPoint, Hole, Point } from "@/types/models";

export interface HoleMapProps {
  hole: Hole;
  selectedTeeId: string;
  playerPosition: Point;
  /** Real-world player position — used by the satellite (web) map. */
  playerGeo?: GeoPoint | null;
  width: number;
  /** Aspect ratio (height = width * ratio). Holes are tall/portrait. */
  ratio?: number;
}

/**
 * Lightweight, dependency-free hole renderer driven by normalized geometry.
 *
 * REAL MAPS: replace this with a Mapbox/Google MapView and plot tee, green,
 * hazards and the player using real lat/lng. The surrounding UI only needs the
 * same yardage data, so this component can be swapped 1:1.
 */
export function HoleMap({ hole, selectedTeeId, playerPosition, width, ratio = 1.5 }: HoleMapProps) {
  const { palette } = useTheme();
  const height = width * ratio;
  const px = (p: Point) => ({ cx: p.x * width, cy: p.y * height });

  const tee = hole.tees.find((t) => t.id === selectedTeeId) ?? hole.tees[0];
  const teePt = px(tee.position);
  const greenPt = px(hole.green.center);
  const player = px(playerPosition);

  // Fairway corridor: tee -> (dogleg) -> green.
  const corridor = hole.dogleg
    ? `M ${teePt.cx} ${teePt.cy} Q ${hole.dogleg.x * width} ${hole.dogleg.y * height} ${greenPt.cx} ${greenPt.cy}`
    : `M ${teePt.cx} ${teePt.cy} L ${greenPt.cx} ${greenPt.cy}`;

  return (
    <View style={[styles.wrap, { width, height, backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Svg width={width} height={height}>
        {/* Rough background */}
        <Rect x={0} y={0} width={width} height={height} fill={palette.mode === "dark" ? "#0E1A12" : "#CFE4CC"} />

        {/* Fairway corridor */}
        <Path
          d={corridor}
          stroke={palette.fairway}
          strokeWidth={width * 0.22}
          strokeLinecap="round"
          fill="none"
          opacity={0.95}
        />

        {/* Green */}
        <Ellipse
          cx={greenPt.cx}
          cy={greenPt.cy}
          rx={width * 0.12}
          ry={height * 0.05}
          fill={palette.greenSurface}
          stroke={palette.accent}
          strokeWidth={1.5}
        />
        {/* Pin */}
        <Line x1={greenPt.cx} y1={greenPt.cy} x2={greenPt.cx} y2={greenPt.cy - height * 0.045} stroke={palette.text} strokeWidth={2} />
        <Circle cx={greenPt.cx} cy={greenPt.cy - height * 0.045} r={3} fill={palette.danger} />

        {/* Hazards */}
        {hole.hazards.map((h) => {
          const pt = px(h.position);
          if (h.kind === "water") {
            return (
              <Ellipse key={h.id} cx={pt.cx} cy={pt.cy} rx={width * 0.09} ry={height * 0.035} fill={palette.hazard} opacity={0.9} />
            );
          }
          if (h.kind === "bunker") {
            return (
              <Ellipse key={h.id} cx={pt.cx} cy={pt.cy} rx={width * 0.06} ry={height * 0.028} fill={palette.bunker} opacity={0.95} />
            );
          }
          return <Circle key={h.id} cx={pt.cx} cy={pt.cy} r={width * 0.04} fill={palette.warning} opacity={0.8} />;
        })}

        {/* Aim line: player -> green center */}
        <Line
          x1={player.cx}
          y1={player.cy}
          x2={greenPt.cx}
          y2={greenPt.cy}
          stroke={palette.primary}
          strokeWidth={2}
          strokeDasharray="6 6"
          opacity={0.85}
        />

        {/* Tee marker */}
        <G>
          <Rect x={teePt.cx - 9} y={teePt.cy - 6} width={18} height={12} rx={3} fill={tee.color} stroke={palette.text} strokeWidth={1} />
          <SvgText x={teePt.cx} y={teePt.cy + 22} fill={palette.muted} fontSize={10} fontWeight="700" textAnchor="middle">
            TEE
          </SvgText>
        </G>

        {/* Player marker */}
        <Circle cx={player.cx} cy={player.cy} r={8} fill={palette.primary} stroke="#FFFFFF" strokeWidth={2} />
        <Circle cx={player.cx} cy={player.cy} r={16} fill="none" stroke={palette.primary} strokeWidth={1.5} opacity={0.5} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
