import type { Sport } from "@/lib/predictions";

const ESPN_PATHS: Record<Sport, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  mlb: "baseball/mlb",
};

const STATUS_ORDER: Record<string, number> = {
  in: 0,
  pre: 1,
  post: 2,
};

export interface LiveMarketGame {
  id: string;
  sport: Sport;
  sportLabel: string;
  date: string;
  displayTime: string;
  status: {
    state: "pre" | "in" | "post";
    shortDetail: string;
    detail: string;
    period?: number;
    clock?: string;
    completed: boolean;
  };
  homeTeam: string;
  awayTeam: string;
  homeAbbr: string;
  awayAbbr: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: number;
  awayScore?: number;
  broadcast?: string;
  bookmaker?: string;
  odds: null | {
    homeMoneyline: number;
    awayMoneyline: number;
    homeMoneylineOpen?: number;
    awayMoneylineOpen?: number;
    homeMoneylineClose?: number;
    awayMoneylineClose?: number;
    spread?: number;
    overUnder?: number;
    homeSpreadOdds?: number;
    awaySpreadOdds?: number;
  };
}

interface EspnScoreboardEvent {
  id: string;
  date: string;
  shortName: string;
  competitions?: Array<{
    competitors?: Array<{
      homeAway?: "home" | "away";
      score?: string;
      team?: {
        displayName?: string;
        abbreviation?: string;
        logo?: string;
      };
    }>;
    broadcasts?: Array<{
      market?: string;
      names?: string[];
    }>;
    status?: {
      type?: {
        state?: "pre" | "in" | "post";
        detail?: string;
        shortDetail?: string;
        completed?: boolean;
      };
      period?: number;
      displayClock?: string;
    };
  }>;
}


interface SummaryProvider {
  name?: string;
  displayName?: string;
}

interface SummaryOddsSide {
  odds?: number | string;
}

interface SummaryMoneylineSide {
  open?: SummaryOddsSide;
  close?: SummaryOddsSide;
  live?: SummaryOddsSide;
}

interface SummaryOddsEntry {
  moneyline?: {
    home?: SummaryMoneylineSide;
    away?: SummaryMoneylineSide;
  };
}

interface SummaryPickcenterEntry {
  provider?: SummaryProvider;
  spread?: number | string;
  overUnder?: number | string;
  homeTeamOdds?: {
    moneyLine?: number | string;
    spreadOdds?: number | string;
  };
  awayTeamOdds?: {
    moneyLine?: number | string;
    spreadOdds?: number | string;
  };
}

interface SummaryResponse {
  pickcenter?: SummaryPickcenterEntry[];
  odds?: SummaryOddsEntry[];
  provider?: SummaryProvider;
}

function toDateKey(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date).replaceAll("-", "");
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function formatTipoff(date: string, statusState: "pre" | "in" | "post"): string {
  const parsed = new Date(date);

  if (statusState === "pre") {
    return parsed.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchSummaryData(sport: Sport, eventId: string): Promise<SummaryResponse | null> {
  const path = ESPN_PATHS[sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${eventId}`;

  try {
    return await fetchJson<SummaryResponse>(url);
  } catch {
    return null;
  }
}

function parseOdds(summary: SummaryResponse | null) {
  if (!summary) return null;

  const pickcenter = Array.isArray(summary.pickcenter) ? summary.pickcenter[0] : null;
  const oddsCollection = Array.isArray(summary.odds) ? summary.odds[0] : null;

  const homeMoneyline =
    parseNumber(pickcenter?.homeTeamOdds?.moneyLine) ??
    parseNumber(oddsCollection?.moneyline?.home?.live?.odds) ??
    parseNumber(oddsCollection?.moneyline?.home?.close?.odds);

  const awayMoneyline =
    parseNumber(pickcenter?.awayTeamOdds?.moneyLine) ??
    parseNumber(oddsCollection?.moneyline?.away?.live?.odds) ??
    parseNumber(oddsCollection?.moneyline?.away?.close?.odds);

  if (homeMoneyline === undefined || awayMoneyline === undefined) {
    return null;
  }

  return {
    homeMoneyline,
    awayMoneyline,
    homeMoneylineOpen: parseNumber(oddsCollection?.moneyline?.home?.open?.odds),
    awayMoneylineOpen: parseNumber(oddsCollection?.moneyline?.away?.open?.odds),
    homeMoneylineClose: parseNumber(oddsCollection?.moneyline?.home?.close?.odds),
    awayMoneylineClose: parseNumber(oddsCollection?.moneyline?.away?.close?.odds),
    spread: parseNumber(pickcenter?.spread),
    overUnder: parseNumber(pickcenter?.overUnder),
    homeSpreadOdds: parseNumber(pickcenter?.homeTeamOdds?.spreadOdds),
    awaySpreadOdds: parseNumber(pickcenter?.awayTeamOdds?.spreadOdds),
    bookmaker:
      pickcenter?.provider?.name ??
      pickcenter?.provider?.displayName ??
      summary.provider?.displayName,
  };
}

function toLiveMarketGame(event: EspnScoreboardEvent, sport: Sport, summary: SummaryResponse | null): LiveMarketGame | null {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((team) => team.homeAway === "home");
  const away = competitors.find((team) => team.homeAway === "away");

  if (!home?.team?.displayName || !away?.team?.displayName) {
    return null;
  }

  const parsedOdds = parseOdds(summary);
  const status = competition?.status;
  const broadcasts = competition?.broadcasts ?? [];
  const nationalBroadcast = broadcasts.find((entry) => entry.market === "national")?.names?.[0];
  const localBroadcast = broadcasts[0]?.names?.[0];

  return {
    id: event.id,
    sport,
    sportLabel: sport.toUpperCase(),
    date: event.date,
    displayTime: formatTipoff(event.date, status?.type?.state ?? "pre"),
    status: {
      state: status?.type?.state ?? "pre",
      shortDetail: status?.type?.shortDetail ?? "Scheduled",
      detail: status?.type?.detail ?? "Scheduled",
      period: status?.period,
      clock: status?.displayClock,
      completed: Boolean(status?.type?.completed),
    },
    homeTeam: home.team.displayName,
    awayTeam: away.team.displayName,
    homeAbbr: home.team.abbreviation ?? home.team.displayName,
    awayAbbr: away.team.abbreviation ?? away.team.displayName,
    homeLogo: home.team.logo,
    awayLogo: away.team.logo,
    homeScore: parseNumber(home.score),
    awayScore: parseNumber(away.score),
    broadcast: nationalBroadcast ?? localBroadcast,
    bookmaker: parsedOdds?.bookmaker,
    odds: parsedOdds
      ? {
          homeMoneyline: parsedOdds.homeMoneyline,
          awayMoneyline: parsedOdds.awayMoneyline,
          homeMoneylineOpen: parsedOdds.homeMoneylineOpen,
          awayMoneylineOpen: parsedOdds.awayMoneylineOpen,
          homeMoneylineClose: parsedOdds.homeMoneylineClose,
          awayMoneylineClose: parsedOdds.awayMoneylineClose,
          spread: parsedOdds.spread,
          overUnder: parsedOdds.overUnder,
          homeSpreadOdds: parsedOdds.homeSpreadOdds,
          awaySpreadOdds: parsedOdds.awaySpreadOdds,
        }
      : null,
  };
}

export async function fetchLiveGamesForSport(sport: Sport, date = new Date()): Promise<LiveMarketGame[]> {
  const path = ESPN_PATHS[sport];
  const dateKey = toDateKey(date);
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dateKey}`;
  const scoreboard = await fetchJson<{ events?: EspnScoreboardEvent[] }>(scoreboardUrl);
  const events = scoreboard.events ?? [];

  const summaries = await Promise.allSettled(events.map((event) => fetchSummaryData(sport, event.id)));

  return events
    .map((event, index) => toLiveMarketGame(event, sport, summaries[index]))
    .filter((game): game is LiveMarketGame => Boolean(game))
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status.state] - STATUS_ORDER[b.status.state];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
}

export async function fetchLiveGamesForSports(sports: Sport[], date = new Date()) {
  const slates = await Promise.allSettled(sports.map((sport) => fetchLiveGamesForSport(sport, date)));
  return slates.flat();
}
