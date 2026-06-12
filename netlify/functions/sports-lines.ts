type Sport = "nba" | "nfl" | "mlb";

type NetlifyEvent = {
  httpMethod: string;
  queryStringParameters?: Record<string, string | undefined> | null;
};

interface LiveMarketGame {
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
  marketSource?: "odds-api" | "espn-fallback";
  odds: null | MarketOdds;
}

interface MarketOdds {
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
}

interface EspnScoreboardEvent {
  id: string;
  date: string;
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

interface SummaryOddsSide {
  odds?: number | string;
}

interface SummaryMoneylineSide {
  open?: SummaryOddsSide;
  close?: SummaryOddsSide;
  live?: SummaryOddsSide;
}

interface SummaryResponse {
  pickcenter?: Array<{
    provider?: { name?: string; displayName?: string };
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
  }>;
  odds?: Array<{
    moneyline?: {
      home?: SummaryMoneylineSide;
      away?: SummaryMoneylineSide;
    };
  }>;
  provider?: { name?: string; displayName?: string };
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    last_update?: string;
    markets?: Array<{
      key: "h2h" | "spreads" | "totals";
      outcomes?: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

const ESPN_PATHS: Record<Sport, string> = {
  nba: "basketball/nba",
  nfl: "football/nfl",
  mlb: "baseball/mlb",
};

const ODDS_API_SPORTS: Record<Sport, string> = {
  nba: "basketball_nba",
  nfl: "americanfootball_nfl",
  mlb: "baseball_mlb",
};

const STATUS_ORDER: Record<string, number> = {
  in: 0,
  pre: 1,
  post: 2,
};

const BOOK_PRIORITY = [
  "draftkings",
  "fanduel",
  "betmgm",
  "caesars",
  "betrivers",
  "pointsbetus",
  "wynnbet",
  "betonlineag",
];

function json(statusCode: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function getSports(query?: Record<string, string | undefined> | null): Sport[] {
  const raw = query?.sports ?? "nba,mlb,nfl";
  const sports = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item): item is Sport => item === "nba" || item === "nfl" || item === "mlb");
  return sports.length ? Array.from(new Set(sports)) : ["nba", "mlb", "nfl"];
}

function getDateKey(query?: Record<string, string | undefined> | null) {
  const requested = query?.date;
  if (requested && /^\d{8}$/.test(requested)) return requested;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date()).replaceAll("-", "");
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
}

function validMoneyline(value: number | undefined): value is number {
  return value !== undefined && value !== 0 && Math.abs(value) >= 100 && Math.abs(value) <= 100000;
}

function easternDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll("-", "");
}

function formatTipoff(date: string, statusState: "pre" | "in" | "post"): string {
  const parsed = new Date(date);

  if (statusState === "pre") {
    const time = parsed.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    if (easternDayKey(parsed) !== easternDayKey(new Date())) {
      const day = parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      });
      return `${day}, ${time}`;
    }
    return time;
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
    const text = await response.text();
    throw new Error(`${response.status} ${text.slice(0, 180)}`);
  }

  return response.json() as Promise<T>;
}

async function fetchEspnScoreboard(sport: Sport, dateKey: string) {
  const path = ESPN_PATHS[sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${dateKey}`;
  const data = await fetchJson<{ events?: EspnScoreboardEvent[] }>(url);
  return data.events ?? [];
}

function addDaysToDateKey(dateKey: string, days: number) {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(4, 6));
  const day = Number(dateKey.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
}

const UPCOMING_LOOKAHEAD_DAYS = 7;
const UPCOMING_GAME_LIMIT = 8;

// Off-days (NBA Finals rest days, NFL offseason weeks) should surface the next slate
// instead of an empty board.
async function fetchEspnScoreboardWithLookahead(sport: Sport, dateKey: string) {
  const todayEvents = await fetchEspnScoreboard(sport, dateKey);
  if (todayEvents.length > 0) return todayEvents;

  const rangeKey = `${addDaysToDateKey(dateKey, 1)}-${addDaysToDateKey(dateKey, UPCOMING_LOOKAHEAD_DAYS)}`;
  try {
    const upcoming = await fetchEspnScoreboard(sport, rangeKey);
    return upcoming
      .filter((event) => event.competitions?.[0]?.status?.type?.state === "pre")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, UPCOMING_GAME_LIMIT);
  } catch {
    return [];
  }
}

async function fetchEspnSummary(sport: Sport, eventId: string): Promise<SummaryResponse | null> {
  const path = ESPN_PATHS[sport];
  const url = `https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${eventId}`;
  try {
    return await fetchJson<SummaryResponse>(url);
  } catch {
    return null;
  }
}

function parseEspnOdds(summary: SummaryResponse | null) {
  if (!summary) return null;

  const pickcenterEntries = Array.isArray(summary.pickcenter) ? summary.pickcenter : [];
  // Some events list stale/partial providers first; prefer an entry with a complete two-way moneyline.
  const pickcenter =
    pickcenterEntries.find(
      (entry) =>
        validMoneyline(parseNumber(entry.homeTeamOdds?.moneyLine)) &&
        validMoneyline(parseNumber(entry.awayTeamOdds?.moneyLine)),
    ) ??
    pickcenterEntries[0] ??
    null;
  const oddsCollection = Array.isArray(summary.odds) ? summary.odds[0] : null;

  const homeMoneyline =
    parseNumber(pickcenter?.homeTeamOdds?.moneyLine) ??
    parseNumber(oddsCollection?.moneyline?.home?.live?.odds) ??
    parseNumber(oddsCollection?.moneyline?.home?.close?.odds);

  const awayMoneyline =
    parseNumber(pickcenter?.awayTeamOdds?.moneyLine) ??
    parseNumber(oddsCollection?.moneyline?.away?.live?.odds) ??
    parseNumber(oddsCollection?.moneyline?.away?.close?.odds);

  if (!validMoneyline(homeMoneyline) || !validMoneyline(awayMoneyline)) return null;

  const odds: MarketOdds = {
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
  };

  return {
    bookmaker:
      pickcenter?.provider?.displayName ??
      pickcenter?.provider?.name ??
      summary.provider?.displayName ??
      summary.provider?.name ??
      "ESPN PickCenter",
    odds,
  };
}

function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .replace(/\bst\.\b/g, "saint")
    .replace(/\bstate\b/g, "st")
    .replace(/\bathletics\b/g, "oakland athletics")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function marketKey(homeTeam: string, awayTeam: string) {
  return `${normalizeTeamName(awayTeam)}::${normalizeTeamName(homeTeam)}`;
}

function pickBookmaker(bookmakers: OddsApiEvent["bookmakers"] = []) {
  for (const key of BOOK_PRIORITY) {
    const match = bookmakers.find((book) => book.key === key);
    if (match) return match;
  }

  return bookmakers[0] ?? null;
}

function parseOddsApiEvent(event: OddsApiEvent) {
  const book = pickBookmaker(event.bookmakers);
  if (!book) return null;

  const h2h = book.markets?.find((market) => market.key === "h2h");
  const spreads = book.markets?.find((market) => market.key === "spreads");
  const totals = book.markets?.find((market) => market.key === "totals");
  const homeMoneyline = h2h?.outcomes?.find((outcome) => outcome.name === event.home_team)?.price;
  const awayMoneyline = h2h?.outcomes?.find((outcome) => outcome.name === event.away_team)?.price;

  if (!validMoneyline(homeMoneyline) || !validMoneyline(awayMoneyline)) return null;

  const homeSpread = spreads?.outcomes?.find((outcome) => outcome.name === event.home_team);
  const awaySpread = spreads?.outcomes?.find((outcome) => outcome.name === event.away_team);
  const total = totals?.outcomes?.find((outcome) => outcome.name.toLowerCase() === "over");

  return {
    key: marketKey(event.home_team, event.away_team),
    bookmaker: book.title || book.key,
    odds: {
      homeMoneyline,
      awayMoneyline,
      spread: homeSpread?.point,
      overUnder: total?.point,
      homeSpreadOdds: homeSpread?.price,
      awaySpreadOdds: awaySpread?.price,
    } satisfies MarketOdds,
  };
}

async function fetchOddsApiMarkets(sport: Sport) {
  const apiKey = process.env.THE_ODDS_API_KEY || process.env.ODDS_API_KEY;
  if (!apiKey) {
    return { configured: false, markets: new Map<string, ReturnType<typeof parseOddsApiEvent>>(), error: null };
  }

  const sportKey = ODDS_API_SPORTS[sport];
  const params = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
  });
  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?${params.toString()}`;

  try {
    const events = await fetchJson<OddsApiEvent[]>(url);
    const markets = new Map<string, ReturnType<typeof parseOddsApiEvent>>();
    events.forEach((event) => {
      const parsed = parseOddsApiEvent(event);
      if (parsed) markets.set(parsed.key, parsed);
    });
    return { configured: true, markets, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch odds provider.";
    return { configured: true, markets: new Map<string, ReturnType<typeof parseOddsApiEvent>>(), error: message };
  }
}

async function toLiveMarketGame(
  event: EspnScoreboardEvent,
  sport: Sport,
  summary: SummaryResponse | null,
  oddsApiMarket: ReturnType<typeof parseOddsApiEvent> | null | undefined,
): Promise<LiveMarketGame | null> {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((team) => team.homeAway === "home");
  const away = competitors.find((team) => team.homeAway === "away");

  if (!home?.team?.displayName || !away?.team?.displayName) return null;

  const espnFallback = parseEspnOdds(summary);
  const status = competition?.status;
  const broadcasts = competition?.broadcasts ?? [];
  const nationalBroadcast = broadcasts.find((entry) => entry.market === "national")?.names?.[0];
  const localBroadcast = broadcasts[0]?.names?.[0];
  const source = oddsApiMarket ? "odds-api" : espnFallback ? "espn-fallback" : undefined;
  const odds = oddsApiMarket?.odds
    ? {
        ...oddsApiMarket.odds,
        homeMoneylineOpen: espnFallback?.odds.homeMoneylineOpen,
        awayMoneylineOpen: espnFallback?.odds.awayMoneylineOpen,
        homeMoneylineClose: espnFallback?.odds.homeMoneylineClose,
        awayMoneylineClose: espnFallback?.odds.awayMoneylineClose,
      }
    : espnFallback?.odds ?? null;

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
    bookmaker: oddsApiMarket?.bookmaker ?? espnFallback?.bookmaker,
    marketSource: source,
    odds,
  };
}

async function fetchSportSlate(sport: Sport, dateKey: string) {
  const [events, oddsProvider] = await Promise.all([
    fetchEspnScoreboardWithLookahead(sport, dateKey),
    fetchOddsApiMarkets(sport),
  ]);
  const summaries = await Promise.allSettled(events.map((event) => fetchEspnSummary(sport, event.id)));

  const games = (
    await Promise.all(
      events.map((event, index) => {
        const summaryResult = summaries[index];
        const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
        const competition = event.competitions?.[0];
        const home = competition?.competitors?.find((team) => team.homeAway === "home")?.team?.displayName;
        const away = competition?.competitors?.find((team) => team.homeAway === "away")?.team?.displayName;
        const oddsApiMarket = home && away ? oddsProvider.markets.get(marketKey(home, away)) : null;
        return toLiveMarketGame(event, sport, summary, oddsApiMarket);
      }),
    )
  )
    .filter((game): game is LiveMarketGame => Boolean(game))
    .sort((a, b) => {
      const statusDiff = STATUS_ORDER[a.status.state] - STATUS_ORDER[b.status.state];
      if (statusDiff !== 0) return statusDiff;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

  return {
    sport,
    games,
    provider: {
      oddsApiConfigured: oddsProvider.configured,
      oddsApiMatched: games.filter((game) => game.marketSource === "odds-api").length,
      espnFallbackMatched: games.filter((game) => game.marketSource === "espn-fallback").length,
      error: oddsProvider.error,
    },
  };
}

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "GET") {
    return json(405, { message: "Method not allowed." }, { "Cache-Control": "no-store" });
  }

  const sports = getSports(event.queryStringParameters);
  const dateKey = getDateKey(event.queryStringParameters);
  const slates = await Promise.allSettled(sports.map((sport) => fetchSportSlate(sport, dateKey)));
  const fulfilled = slates.flatMap((slate) => (slate.status === "fulfilled" ? [slate.value] : []));
  const games = fulfilled.flatMap((slate) => slate.games);

  return json(200, {
    dateKey,
    updatedAt: new Date().toISOString(),
    games,
    providerStatus: fulfilled.map((slate) => slate.provider),
  });
};
