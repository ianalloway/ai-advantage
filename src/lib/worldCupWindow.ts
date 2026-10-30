// First men's World Cup this app shipped for, and the cycle length in years.
const WORLD_CUP_BASE_YEAR = 2026;
const WORLD_CUP_CYCLE_YEARS = 4;

/**
 * True only inside the Jun 11 - Jul 19 window of an actual tournament year.
 *
 * The homepage's previous check meant to be edition-aware, but its ternary
 * returned the same year on both branches, so the edition test was computed and
 * discarded. What survived was a bare date test that would have opened the site
 * on the World Cup every summer forever, including the years between tournaments.
 */
export function isWorldCupWindow(now: Date): boolean {
  const year = now.getUTCFullYear();
  const isEditionYear =
    year >= WORLD_CUP_BASE_YEAR && (year - WORLD_CUP_BASE_YEAR) % WORLD_CUP_CYCLE_YEARS === 0;
  if (!isEditionYear) return false;
  return now >= new Date(`${year}-06-11T00:00:00Z`) && now <= new Date(`${year}-07-19T00:00:00Z`);
}
