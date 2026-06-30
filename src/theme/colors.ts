/**
 * LoopMind color system — premium golf palette built around green / black / white.
 * Two complete palettes (light + dark) are exposed through the ThemeProvider.
 */

export type ThemeMode = "light" | "dark";

export interface Palette {
  mode: ThemeMode;
  /** App background */
  background: string;
  /** Slightly raised background (e.g. grouped sections) */
  surface: string;
  /** Card background */
  card: string;
  /** Primary text */
  text: string;
  /** Secondary / muted text */
  muted: string;
  /** Hairline borders */
  border: string;
  /** Brand green — primary actions */
  primary: string;
  /** Text/!icon color drawn on top of `primary` */
  onPrimary: string;
  /** Deep fairway green — headers, map accents */
  accent: string;
  /** Positive (birdie / safe) */
  success: string;
  /** Caution (risk / layup) */
  warning: string;
  /** Danger (hazard / penalty) */
  danger: string;
  /** Fairway fill on the hole map */
  fairway: string;
  /** Green (putting surface) fill on the hole map */
  greenSurface: string;
  /** Water / hazard fill */
  hazard: string;
  /** Sand bunker fill */
  bunker: string;
}

export const lightPalette: Palette = {
  mode: "light",
  background: "#F4F7F4",
  surface: "#ECF1EC",
  card: "#FFFFFF",
  text: "#0C1B14",
  muted: "#5E6E64",
  border: "#E1E8E1",
  primary: "#12A45A",
  onPrimary: "#FFFFFF",
  accent: "#0B3D2E",
  success: "#16A34A",
  warning: "#D9822B",
  danger: "#D1453B",
  fairway: "#9BD5A0",
  greenSurface: "#5EC07A",
  hazard: "#4FA3D1",
  bunker: "#E7D8A6",
};

export const darkPalette: Palette = {
  mode: "dark",
  background: "#080C0A",
  surface: "#101712",
  card: "#141D17",
  text: "#F1F5F1",
  muted: "#93A39A",
  border: "#212E25",
  primary: "#2BD576",
  onPrimary: "#04140B",
  accent: "#0B3D2E",
  success: "#34D27B",
  warning: "#E5A44D",
  danger: "#F2645A",
  fairway: "#1F5B3A",
  greenSurface: "#2C8E54",
  hazard: "#2E6E96",
  bunker: "#7A6B43",
};

export const palettes: Record<ThemeMode, Palette> = {
  light: lightPalette,
  dark: darkPalette,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 26,
  display: 56,
} as const;
