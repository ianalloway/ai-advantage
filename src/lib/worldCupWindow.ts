/** Known tournament dates only; add future editions when their dates are confirmed. */
const WORLD_CUP_WINDOWS = [
  { start: Date.parse("2026-06-11T00:00:00Z"), end: Date.parse("2026-07-20T00:00:00Z") },
];

export function isWorldCupWindow(now: Date): boolean {
  const timestamp = now.getTime();
  return WORLD_CUP_WINDOWS.some(({ start, end }) => timestamp >= start && timestamp < end);
}
