/**
 * NBA Team Rosters - 2025-26 Season
 * Key players and their stats for enhanced predictions
 */

export interface Player {
  name: string;
  position: 'PG' | 'SG' | 'SF' | 'PF' | 'C';
  ppg: number;  // Points per game
  rpg: number;  // Rebounds per game
  apg: number;  // Assists per game
  mpg: number;  // Minutes per game
  injury?: string;  // Current injury status
}

export interface TeamRoster {
  team: string;
  conference: 'Eastern' | 'Western';
  division: string;
  players: Player[];
}

export const NBA_ROSTERS: TeamRoster[] = [
  {
    team: 'Boston Celtics',
    conference: 'Eastern',
    division: 'Atlantic',
    players: [
      { name: 'Jayson Tatum', position: 'SF', ppg: 27.2, rpg: 8.5, apg: 4.8, mpg: 36.2 },
      { name: 'Jaylen Brown', position: 'SG', ppg: 24.5, rpg: 5.8, apg: 3.5, mpg: 34.5 },
      { name: 'Derrick White', position: 'PG', ppg: 15.8, rpg: 4.2, apg: 5.2, mpg: 32.1 },
      { name: 'Kristaps Porzingis', position: 'C', ppg: 20.2, rpg: 7.5, apg: 2.0, mpg: 28.5 },
      { name: 'Jrue Holiday', position: 'PG', ppg: 12.5, rpg: 5.0, apg: 4.8, mpg: 30.2 },
    ],
  },
  {
    team: 'Cleveland Cavaliers',
    conference: 'Eastern',
    division: 'Central',
    players: [
      { name: 'Donovan Mitchell', position: 'SG', ppg: 26.8, rpg: 4.5, apg: 5.2, mpg: 35.5 },
      { name: 'Darius Garland', position: 'PG', ppg: 21.5, rpg: 2.8, apg: 7.8, mpg: 33.2 },
      { name: 'Evan Mobley', position: 'PF', ppg: 16.2, rpg: 9.2, apg: 3.5, mpg: 32.8 },
      { name: 'Jarrett Allen', position: 'C', ppg: 14.5, rpg: 10.8, apg: 1.8, mpg: 30.5 },
      { name: 'Max Strus', position: 'SG', ppg: 12.2, rpg: 3.5, apg: 2.2, mpg: 28.5 },
    ],
  },
  {
    team: 'Oklahoma City Thunder',
    conference: 'Western',
    division: 'Northwest',
    players: [
      { name: 'Shai Gilgeous-Alexander', position: 'PG', ppg: 31.5, rpg: 5.5, apg: 6.2, mpg: 34.8 },
      { name: 'Chet Holmgren', position: 'C', ppg: 17.8, rpg: 8.5, apg: 2.8, mpg: 30.2 },
      { name: 'Jalen Williams', position: 'SF', ppg: 19.2, rpg: 5.2, apg: 4.5, mpg: 32.5 },
      { name: 'Lu Dort', position: 'SG', ppg: 11.5, rpg: 4.2, apg: 2.0, mpg: 28.8 },
      { name: 'Isaiah Hartenstein', position: 'C', ppg: 8.5, rpg: 8.2, apg: 2.5, mpg: 24.5 },
    ],
  },
  {
    team: 'Denver Nuggets',
    conference: 'Western',
    division: 'Northwest',
    players: [
      { name: 'Nikola Jokic', position: 'C', ppg: 26.5, rpg: 12.5, apg: 9.2, mpg: 34.5 },
      { name: 'Jamal Murray', position: 'PG', ppg: 21.2, rpg: 4.2, apg: 6.8, mpg: 33.2 },
      { name: 'Michael Porter Jr.', position: 'SF', ppg: 17.5, rpg: 7.2, apg: 1.5, mpg: 30.5 },
      { name: 'Aaron Gordon', position: 'PF', ppg: 14.2, rpg: 6.5, apg: 3.2, mpg: 31.2 },
      { name: 'Christian Braun', position: 'SG', ppg: 10.8, rpg: 4.5, apg: 2.5, mpg: 26.8 },
    ],
  },
  {
    team: 'Milwaukee Bucks',
    conference: 'Eastern',
    division: 'Central',
    players: [
      { name: 'Giannis Antetokounmpo', position: 'PF', ppg: 30.5, rpg: 11.8, apg: 6.2, mpg: 35.5 },
      { name: 'Damian Lillard', position: 'PG', ppg: 25.2, rpg: 4.5, apg: 7.5, mpg: 34.8 },
      { name: 'Khris Middleton', position: 'SF', ppg: 15.8, rpg: 4.8, apg: 4.2, mpg: 28.5 },
      { name: 'Brook Lopez', position: 'C', ppg: 12.5, rpg: 5.2, apg: 1.5, mpg: 26.2 },
      { name: 'Bobby Portis', position: 'PF', ppg: 11.2, rpg: 7.5, apg: 1.8, mpg: 22.5 },
    ],
  },
  {
    team: 'New York Knicks',
    conference: 'Eastern',
    division: 'Atlantic',
    players: [
      { name: 'Jalen Brunson', position: 'PG', ppg: 28.5, rpg: 3.8, apg: 7.2, mpg: 35.8 },
      { name: 'Karl-Anthony Towns', position: 'C', ppg: 24.2, rpg: 10.5, apg: 3.2, mpg: 34.2 },
      { name: 'Mikal Bridges', position: 'SF', ppg: 18.5, rpg: 4.2, apg: 3.5, mpg: 33.5 },
      { name: 'OG Anunoby', position: 'SF', ppg: 15.2, rpg: 5.5, apg: 2.2, mpg: 31.2 },
      { name: 'Josh Hart', position: 'SG', ppg: 10.8, rpg: 8.2, apg: 4.5, mpg: 32.5 },
    ],
  },
  {
    team: 'Los Angeles Lakers',
    conference: 'Western',
    division: 'Pacific',
    players: [
      { name: 'LeBron James', position: 'SF', ppg: 25.8, rpg: 7.5, apg: 8.2, mpg: 34.5 },
      { name: 'Anthony Davis', position: 'PF', ppg: 24.5, rpg: 12.2, apg: 3.5, mpg: 35.2 },
      { name: 'Austin Reaves', position: 'SG', ppg: 17.2, rpg: 4.5, apg: 5.8, mpg: 32.8 },
      { name: "D'Angelo Russell", position: 'PG', ppg: 14.5, rpg: 3.2, apg: 6.2, mpg: 28.5 },
      { name: 'Rui Hachimura', position: 'PF', ppg: 12.8, rpg: 5.5, apg: 1.5, mpg: 26.2 },
    ],
  },
  {
    team: 'Golden State Warriors',
    conference: 'Western',
    division: 'Pacific',
    players: [
      { name: 'Stephen Curry', position: 'PG', ppg: 26.5, rpg: 4.8, apg: 6.5, mpg: 33.5 },
      { name: 'Andrew Wiggins', position: 'SF', ppg: 16.2, rpg: 4.5, apg: 2.2, mpg: 30.2 },
      { name: 'Draymond Green', position: 'PF', ppg: 8.5, rpg: 7.2, apg: 6.8, mpg: 28.5 },
      { name: 'Jonathan Kuminga', position: 'SF', ppg: 14.8, rpg: 5.2, apg: 2.5, mpg: 28.8 },
      { name: 'Brandin Podziemski', position: 'SG', ppg: 10.5, rpg: 5.8, apg: 4.2, mpg: 26.5 },
    ],
  },
  {
    team: 'Phoenix Suns',
    conference: 'Western',
    division: 'Pacific',
    players: [
      { name: 'Kevin Durant', position: 'SF', ppg: 27.5, rpg: 6.8, apg: 5.2, mpg: 35.2 },
      { name: 'Devin Booker', position: 'SG', ppg: 26.2, rpg: 4.5, apg: 6.8, mpg: 34.8 },
      { name: 'Bradley Beal', position: 'SG', ppg: 18.5, rpg: 4.2, apg: 5.2, mpg: 30.5 },
      { name: 'Jusuf Nurkic', position: 'C', ppg: 10.2, rpg: 9.5, apg: 2.8, mpg: 26.2 },
      { name: 'Grayson Allen', position: 'SG', ppg: 11.5, rpg: 3.5, apg: 2.5, mpg: 24.8 },
    ],
  },
  {
    team: 'Dallas Mavericks',
    conference: 'Western',
    division: 'Southwest',
    players: [
      { name: 'Luka Doncic', position: 'PG', ppg: 33.2, rpg: 9.5, apg: 9.8, mpg: 37.2 },
      { name: 'Kyrie Irving', position: 'PG', ppg: 25.5, rpg: 5.2, apg: 5.5, mpg: 34.5 },
      { name: 'Klay Thompson', position: 'SG', ppg: 14.8, rpg: 3.5, apg: 2.2, mpg: 28.5 },
      { name: 'PJ Washington', position: 'PF', ppg: 12.5, rpg: 7.2, apg: 2.5, mpg: 30.2 },
      { name: 'Daniel Gafford', position: 'C', ppg: 10.2, rpg: 6.8, apg: 1.2, mpg: 24.5 },
    ],
  },
  {
    team: 'Miami Heat',
    conference: 'Eastern',
    division: 'Southeast',
    players: [
      { name: 'Jimmy Butler', position: 'SF', ppg: 20.5, rpg: 5.8, apg: 5.2, mpg: 32.5 },
      { name: 'Bam Adebayo', position: 'C', ppg: 19.2, rpg: 10.5, apg: 4.5, mpg: 34.2 },
      { name: 'Tyler Herro', position: 'SG', ppg: 21.5, rpg: 5.2, apg: 5.0, mpg: 33.8 },
      { name: 'Terry Rozier', position: 'PG', ppg: 16.2, rpg: 4.2, apg: 4.8, mpg: 30.5 },
      { name: 'Jaime Jaquez Jr.', position: 'SF', ppg: 11.8, rpg: 4.5, apg: 2.5, mpg: 26.8 },
    ],
  },
  {
    team: 'Minnesota Timberwolves',
    conference: 'Western',
    division: 'Northwest',
    players: [
      { name: 'Anthony Edwards', position: 'SG', ppg: 28.5, rpg: 5.8, apg: 5.5, mpg: 35.5 },
      { name: 'Julius Randle', position: 'PF', ppg: 20.2, rpg: 9.5, apg: 5.2, mpg: 34.2 },
      { name: 'Rudy Gobert', position: 'C', ppg: 13.5, rpg: 12.8, apg: 1.5, mpg: 32.5 },
      { name: 'Jaden McDaniels', position: 'SF', ppg: 12.2, rpg: 4.5, apg: 2.2, mpg: 30.8 },
      { name: 'Mike Conley', position: 'PG', ppg: 9.5, rpg: 3.2, apg: 6.2, mpg: 26.5 },
    ],
  },
];

/**
 * Get roster for a specific team
 */
export function getTeamRoster(teamName: string): TeamRoster | undefined {
  return NBA_ROSTERS.find(r => r.team === teamName);
}

/**
 * Get all teams in a conference
 */
export function getConferenceTeams(conference: 'Eastern' | 'Western'): TeamRoster[] {
  return NBA_ROSTERS.filter(r => r.conference === conference);
}

/**
 * Get top scorers across all teams
 */
export function getTopScorers(limit: number = 10): Array<Player & { team: string }> {
  const allPlayers: Array<Player & { team: string }> = [];
  
  for (const roster of NBA_ROSTERS) {
    for (const player of roster.players) {
      allPlayers.push({ ...player, team: roster.team });
    }
  }
  
  return allPlayers
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, limit);
}

/**
 * Calculate team's total star power (sum of top 3 players' PPG)
 */
export function getTeamStarPower(teamName: string): number {
  const roster = getTeamRoster(teamName);
  if (!roster) return 0;
  
  const topThree = [...roster.players]
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 3);
  
  return topThree.reduce((sum, p) => sum + p.ppg, 0);
}
