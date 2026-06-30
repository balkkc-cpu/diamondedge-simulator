// Native (and default) hole map = the schematic SVG renderer.
// On web, Metro resolves `HoleMap.web.tsx` instead, which renders a real
// satellite map and falls back to this SVG when needed.
export { SvgHoleMap as HoleMap } from "./SvgHoleMap";
export type { HoleMapProps } from "./SvgHoleMap";
