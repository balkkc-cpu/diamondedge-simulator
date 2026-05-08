/** US Eastern for MLB slate display (handles EST ↔ EDT via IANA zone). */
export const MLB_DISPLAY_TZ = "America/New_York";

/**
 * Format an ISO / epoch instant as local wall time in Eastern (what fans expect for first pitch).
 */
export function formatDateTimeEastern(iso: string | number | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(d.getTime())) return typeof iso === "string" ? iso : "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MLB_DISPLAY_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(d);
}
