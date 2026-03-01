/**
 * Auth utilities — Issue #20
 * GitHub OAuth via Netlify Identity / simulated for demo.
 * Uses localStorage to persist session and picks history.
 */

export interface User {
  id: string;
  login: string;
  avatar_url: string;
  name: string;
}

export type Outcome = "W" | "L" | "P" | "pending";

export interface SavedPick {
  id: string;
  game: string;
  pick: string;
  odds: number;
  edge: number;
  confidence: "high" | "medium" | "low";
  sport: string;
  savedAt: string;   // ISO date
  settledAt?: string;
  outcome: Outcome;
  stake?: number;    // dollars wagered
  profit?: number;   // dollars won/lost
}

// ---------- Storage helpers ----------

const USER_KEY = "aia_user";
const PICKS_KEY = "aia_picks";

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUser(user: User | null): void {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function getSavedPicks(): SavedPick[] {
  try {
    const raw = localStorage.getItem(PICKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function savePick(pick: Omit<SavedPick, "id" | "savedAt" | "outcome">): SavedPick {
  const picks = getSavedPicks();
  const newPick: SavedPick = {
    ...pick,
    id: `pick-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: new Date().toISOString(),
    outcome: "pending",
  };
  localStorage.setItem(PICKS_KEY, JSON.stringify([newPick, ...picks]));
  return newPick;
}

export function updatePickOutcome(
  id: string,
  outcome: Outcome,
  stake?: number,
  profit?: number
): void {
  const picks = getSavedPicks().map((p) =>
    p.id === id
      ? { ...p, outcome, stake, profit, settledAt: new Date().toISOString() }
      : p
  );
  localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
}

export function deletePick(id: string): void {
  const picks = getSavedPicks().filter((p) => p.id !== id);
  localStorage.setItem(PICKS_KEY, JSON.stringify(picks));
}

// ---------- ROI calculation ----------

export interface RoiStats {
  totalPicks: number;
  settled: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winRate: number;
  totalStaked: number;
  totalProfit: number;
  roi: number;  // %
}

export function calcRoi(picks: SavedPick[]): RoiStats {
  const settled = picks.filter((p) => p.outcome !== "pending");
  const wins = settled.filter((p) => p.outcome === "W").length;
  const losses = settled.filter((p) => p.outcome === "L").length;
  const pushes = settled.filter((p) => p.outcome === "P").length;
  const totalStaked = settled.reduce((s, p) => s + (p.stake ?? 0), 0);
  const totalProfit = settled.reduce((s, p) => s + (p.profit ?? 0), 0);
  return {
    totalPicks: picks.length,
    settled: settled.length,
    wins,
    losses,
    pushes,
    pending: picks.filter((p) => p.outcome === "pending").length,
    winRate: settled.length > 0 ? wins / settled.length : 0,
    totalStaked,
    totalProfit,
    roi: totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0,
  };
}

// ---------- CSV export ----------

export function exportPicksToCsv(picks: SavedPick[]): void {
  const header = "Date,Game,Pick,Odds,Confidence,Sport,Outcome,Stake,Profit";
  const rows = picks.map((p) =>
    [
      new Date(p.savedAt).toLocaleDateString(),
      `"${p.game}"`,
      `"${p.pick}"`,
      p.odds,
      p.confidence,
      p.sport,
      p.outcome,
      p.stake ?? "",
      p.profit ?? "",
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-advantage-picks-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Demo GitHub OAuth ----------
// In production, replace with real GitHub OAuth flow (e.g. Supabase, Netlify Identity)

export function loginWithGitHub(): void {
  // For demo: simulate successful OAuth with a fake user
  // In production: window.location.href = "/api/auth/github"
  const demoUser: User = {
    id: "demo-user-001",
    login: "sports-bettor",
    avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=SB`,
    name: "Sports Bettor",
  };
  setUser(demoUser);
  window.dispatchEvent(new Event("aia-auth-change"));
}

export function logout(): void {
  setUser(null);
  window.dispatchEvent(new Event("aia-auth-change"));
}
