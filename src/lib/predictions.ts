/**
 * Sports Betting ML - Prediction utilities
 * Ported from the Sports Betting ML HuggingFace Space
 */

// Team statistics (2025-26 season data)
export const TEAM_STATS: Record<string, TeamStats> = {
  'Boston Celtics': { win_pct: 0.72, avg_points_for: 118.5, avg_points_against: 109.2, point_diff: 9.3 },
  'Cleveland Cavaliers': { win_pct: 0.70, avg_points_for: 116.8, avg_points_against: 108.5, point_diff: 8.3 },
  'Oklahoma City Thunder': { win_pct: 0.68, avg_points_for: 117.2, avg_points_against: 106.8, point_diff: 10.4 },
  'Denver Nuggets': { win_pct: 0.65, avg_points_for: 115.5, avg_points_against: 110.2, point_diff: 5.3 },
  'Memphis Grizzlies': { win_pct: 0.62, avg_points_for: 114.8, avg_points_against: 111.5, point_diff: 3.3 },
  'Milwaukee Bucks': { win_pct: 0.60, avg_points_for: 116.2, avg_points_against: 112.8, point_diff: 3.4 },
  'New York Knicks': { win_pct: 0.58, avg_points_for: 112.5, avg_points_against: 108.2, point_diff: 4.3 },
  'Los Angeles Lakers': { win_pct: 0.55, avg_points_for: 114.2, avg_points_against: 112.5, point_diff: 1.7 },
  'Golden State Warriors': { win_pct: 0.52, avg_points_for: 113.8, avg_points_against: 113.2, point_diff: 0.6 },
  'Phoenix Suns': { win_pct: 0.50, avg_points_for: 112.5, avg_points_against: 113.0, point_diff: -0.5 },
  'Miami Heat': { win_pct: 0.48, avg_points_for: 108.5, avg_points_against: 110.2, point_diff: -1.7 },
  'Dallas Mavericks': { win_pct: 0.52, avg_points_for: 115.2, avg_points_against: 114.5, point_diff: 0.7 },
  'Los Angeles Clippers': { win_pct: 0.45, avg_points_for: 110.5, avg_points_against: 112.8, point_diff: -2.3 },
  'Sacramento Kings': { win_pct: 0.48, avg_points_for: 113.2, avg_points_against: 114.5, point_diff: -1.3 },
  'Indiana Pacers': { win_pct: 0.50, avg_points_for: 118.5, avg_points_against: 118.2, point_diff: 0.3 },
  'Minnesota Timberwolves': { win_pct: 0.55, avg_points_for: 110.8, avg_points_against: 108.5, point_diff: 2.3 },
  'Houston Rockets': { win_pct: 0.52, avg_points_for: 112.5, avg_points_against: 111.8, point_diff: 0.7 },
  'San Antonio Spurs': { win_pct: 0.35, avg_points_for: 108.2, avg_points_against: 115.5, point_diff: -7.3 },
  'Detroit Pistons': { win_pct: 0.30, avg_points_for: 106.5, avg_points_against: 116.2, point_diff: -9.7 },
  'Washington Wizards': { win_pct: 0.25, avg_points_for: 105.8, avg_points_against: 118.5, point_diff: -12.7 },
  'Philadelphia 76ers': { win_pct: 0.45, avg_points_for: 111.2, avg_points_against: 112.8, point_diff: -1.6 },
  'Brooklyn Nets': { win_pct: 0.38, avg_points_for: 109.5, avg_points_against: 114.2, point_diff: -4.7 },
  'Toronto Raptors': { win_pct: 0.35, avg_points_for: 108.8, avg_points_against: 115.0, point_diff: -6.2 },
  'Chicago Bulls': { win_pct: 0.42, avg_points_for: 110.5, avg_points_against: 113.2, point_diff: -2.7 },
  'Atlanta Hawks': { win_pct: 0.45, avg_points_for: 114.2, avg_points_against: 116.5, point_diff: -2.3 },
  'Charlotte Hornets': { win_pct: 0.32, avg_points_for: 107.5, avg_points_against: 116.8, point_diff: -9.3 },
  'Orlando Magic': { win_pct: 0.55, avg_points_for: 109.8, avg_points_against: 106.5, point_diff: 3.3 },
  'New Orleans Pelicans': { win_pct: 0.42, avg_points_for: 111.5, avg_points_against: 113.8, point_diff: -2.3 },
  'Portland Trail Blazers': { win_pct: 0.28, avg_points_for: 106.2, avg_points_against: 117.5, point_diff: -11.3 },
  'Utah Jazz': { win_pct: 0.30, avg_points_for: 107.8, avg_points_against: 116.2, point_diff: -8.4 },
};

export interface TeamStats {
  win_pct: number;
  avg_points_for: number;
  avg_points_against: number;
  point_diff: number;
}

export interface GamePrediction {
  homeTeam: string;
  awayTeam: string;
  homeProb: number;
  awayProb: number;
  homeOdds: number;
  awayOdds: number;
  homeImpliedProb: number;
  awayImpliedProb: number;
  homeEdge: number;
  awayEdge: number;
  predictedWinner: string;
  confidence: number;
  valueBet: ValueBet | null;
}

export interface ValueBet {
  team: string;
  location: 'Home' | 'Away';
  modelProb: number;
  impliedProb: number;
  odds: number;
  edge: number;
  kellyPct: number;
  suggestedBet: number;
}

// Kelly Criterion functions
export function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

export function americanToImpliedProb(americanOdds: number): number {
  const decimal = americanToDecimal(americanOdds);
  return 1 / decimal;
}

export function kellyCriterion(winProb: number, decimalOdds: number, fraction: number = 0.25): number {
  const b = decimalOdds - 1;
  const p = winProb;
  const q = 1 - p;
  
  let kelly = (b * p - q) / b;
  kelly = kelly * fraction;
  
  return Math.max(0, Math.min(kelly, 1));
}

export function calculateEdge(modelProb: number, impliedProb: number): number {
  return (modelProb - impliedProb) * 100;
}

// Prediction function (heuristic-based, mimics XGBoost model)
export function predictGame(homeStats: TeamStats, awayStats: TeamStats): [number, number] {
  // Base probability from win percentages
  const homeWp = homeStats.win_pct;
  const awayWp = awayStats.win_pct;
  
  // Point differential factor
  const homePd = homeStats.point_diff;
  const awayPd = awayStats.point_diff;
  const pdFactor = (homePd - awayPd) / 20;
  
  // Home court advantage (~3-4 points in NBA)
  const homeAdvantage = 0.03;
  
  // Combine factors
  const baseProb = (homeWp + awayWp) > 0 ? homeWp / (homeWp + awayWp) : 0.5;
  
  // Adjust for point differential and home advantage
  let homeProb = baseProb + pdFactor * 0.1 + homeAdvantage;
  
  // Clamp to valid probability range
  homeProb = Math.max(0.1, Math.min(0.9, homeProb));
  const awayProb = 1 - homeProb;
  
  return [homeProb, awayProb];
}

export function getDefaultStats(): TeamStats {
  return {
    win_pct: 0.5,
    avg_points_for: 110,
    avg_points_against: 110,
    point_diff: 0
  };
}

// Generate sample odds based on probability
function generateOdds(prob: number): number {
  // Convert probability to American odds with some juice
  const fairOdds = prob > 0.5 
    ? -Math.round((prob / (1 - prob)) * 100)
    : Math.round(((1 - prob) / prob) * 100);
  
  // Add ~5% juice
  if (fairOdds < 0) {
    return fairOdds - 10;
  } else {
    return fairOdds - 5;
  }
}

// Get today's NBA games (demo data)
export function getTodaysGames(): Array<{ homeTeam: string; awayTeam: string }> {
  return [
    { homeTeam: 'Los Angeles Lakers', awayTeam: 'Golden State Warriors' },
    { homeTeam: 'Boston Celtics', awayTeam: 'Miami Heat' },
    { homeTeam: 'Denver Nuggets', awayTeam: 'Phoenix Suns' },
    { homeTeam: 'Milwaukee Bucks', awayTeam: 'Cleveland Cavaliers' },
    { homeTeam: 'New York Knicks', awayTeam: 'Philadelphia 76ers' },
  ];
}

// Analyze a game and return full prediction
export function analyzeGame(
  homeTeam: string, 
  awayTeam: string, 
  bankroll: number = 1000,
  minEdge: number = 3,
  kellyFraction: number = 0.25
): GamePrediction {
  const homeStats = TEAM_STATS[homeTeam] || getDefaultStats();
  const awayStats = TEAM_STATS[awayTeam] || getDefaultStats();
  
  const [homeProb, awayProb] = predictGame(homeStats, awayStats);
  
  // Generate realistic odds
  const homeOdds = generateOdds(homeProb);
  const awayOdds = generateOdds(awayProb);
  
  const homeImpliedProb = americanToImpliedProb(homeOdds);
  const awayImpliedProb = americanToImpliedProb(awayOdds);
  
  const homeEdge = calculateEdge(homeProb, homeImpliedProb);
  const awayEdge = calculateEdge(awayProb, awayImpliedProb);
  
  const predictedWinner = homeProb > 0.5 ? homeTeam : awayTeam;
  const confidence = Math.max(homeProb, awayProb);
  
  // Check for value bet
  let valueBet: ValueBet | null = null;
  
  if (homeEdge >= minEdge) {
    const decimalOdds = americanToDecimal(homeOdds);
    const kellyPct = kellyCriterion(homeProb, decimalOdds, kellyFraction);
    valueBet = {
      team: homeTeam,
      location: 'Home',
      modelProb: homeProb,
      impliedProb: homeImpliedProb,
      odds: homeOdds,
      edge: homeEdge,
      kellyPct,
      suggestedBet: kellyPct * bankroll
    };
  } else if (awayEdge >= minEdge) {
    const decimalOdds = americanToDecimal(awayOdds);
    const kellyPct = kellyCriterion(awayProb, decimalOdds, kellyFraction);
    valueBet = {
      team: awayTeam,
      location: 'Away',
      modelProb: awayProb,
      impliedProb: awayImpliedProb,
      odds: awayOdds,
      edge: awayEdge,
      kellyPct,
      suggestedBet: kellyPct * bankroll
    };
  }
  
  return {
    homeTeam,
    awayTeam,
    homeProb,
    awayProb,
    homeOdds,
    awayOdds,
    homeImpliedProb,
    awayImpliedProb,
    homeEdge,
    awayEdge,
    predictedWinner,
    confidence,
    valueBet
  };
}

// Parse user input to extract teams
export function parseGameInput(input: string): { homeTeam: string; awayTeam: string } | null {
  const normalizedInput = input.toLowerCase();
  
  // Find matching teams
  const teamNames = Object.keys(TEAM_STATS);
  const foundTeams: string[] = [];
  
  for (const team of teamNames) {
    const teamLower = team.toLowerCase();
    const shortName = team.split(' ').pop()?.toLowerCase() || '';
    
    if (normalizedInput.includes(teamLower) || normalizedInput.includes(shortName)) {
      foundTeams.push(team);
    }
  }
  
  if (foundTeams.length >= 2) {
    // First team mentioned is usually away, second is home (or use @ symbol)
    if (normalizedInput.includes('@') || normalizedInput.includes('at ')) {
      return { homeTeam: foundTeams[1], awayTeam: foundTeams[0] };
    }
    // "vs" format - first team is home
    return { homeTeam: foundTeams[0], awayTeam: foundTeams[1] };
  }
  
  if (foundTeams.length === 1) {
    // Single team - pair with a random opponent
    const opponent = teamNames.find(t => t !== foundTeams[0]) || 'Miami Heat';
    return { homeTeam: foundTeams[0], awayTeam: opponent };
  }
  
  return null;
}

// Format odds for display
export function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

// Format probability as percentage
export function formatProb(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}

// Format edge
export function formatEdge(edge: number): string {
  return edge > 0 ? `+${edge.toFixed(1)}%` : `${edge.toFixed(1)}%`;
}
