/**
 * AI Advantage Discord Bot — Full Edition
 *
 * Core features:
 *  - Daily picks posted at 10 AM with embed cards
 *  - Weekly W/L/profit summary on Sundays
 *
 * Value / profit-finding features:
 *  - /edge           — ranks today's picks by edge (highest value first)
 *  - /bet <game> <bankroll>  — Kelly-optimal bet size for your bankroll
 *  - /arb            — scans for arbitrage opportunities across books
 *  - /clv            — closing line value report (are picks beating the market?)
 *  - /kelly <winrate> <odds> <bank> — raw Kelly calculator
 *  - /picks          — full today's slate
 *  - /pick <game>    — single-game analysis
 *  - /bankroll       — season stats
 *  - /result <pick_id> <W|L|P> — log a result
 *
 * Automated alerts:
 *  - Line movement alert when a line shifts > 5 pts (every 15 min poll)
 *  - Value alert when a new high-edge (>5%) opportunity appears
 *
 * Setup:
 *   npm install discord.js node-cron
 *   DISCORD_TOKEN=xxx DISCORD_CLIENT_ID=yyy PICKS_CHANNEL_ID=zzz node bot.js
 */

import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
} from "discord.js";
import cron from "node-cron";

const TOKEN           = process.env.DISCORD_TOKEN;
const CLIENT_ID       = process.env.DISCORD_CLIENT_ID;
const PICKS_CHANNEL_ID = process.env.PICKS_CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !PICKS_CHANNEL_ID) {
  console.error("Missing env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID, PICKS_CHANNEL_ID");
  process.exit(1);
}

// ─── Data ─────────────────────────────────────────────────────────────────────

/**
 * In production, replace TODAYS_PICKS with a fetch() to your /api/picks/today endpoint.
 * Each pick contains odds from multiple books so the arb scanner can compare them.
 */
const TODAYS_PICKS = [
  {
    id: "pick_001",
    game: "Bucks @ Celtics",
    sport: "NBA",
    time: "7:30 PM ET",
    pick: "Celtics ML",
    modelProb: 0.68,
    confidence: "HIGH",
    // Best available odds
    bestOdds: -190,
    bestBook: "DraftKings",
    // Odds across books (for arb detection)
    bookOdds: {
      DraftKings: { celtics: -190, bucks: +162 },
      FanDuel:    { celtics: -195, bucks: +165 },
      BetMGM:     { celtics: -200, bucks: +170 },
      Caesars:    { celtics: -185, bucks: +158 },
    },
    // Opening line for CLV
    openingLine: -210,
    // Current closing estimate
    closingLine: -195,
  },
  {
    id: "pick_002",
    game: "Nuggets @ Thunder",
    sport: "NBA",
    time: "9:00 PM ET",
    pick: "Thunder ML",
    modelProb: 0.74,
    confidence: "HIGH",
    bestOdds: -275,
    bestBook: "FanDuel",
    bookOdds: {
      DraftKings: { thunder: -265, nuggets: +218 },
      FanDuel:    { thunder: -275, nuggets: +225 },
      BetMGM:     { thunder: -280, nuggets: +230 },
      Caesars:    { thunder: -270, nuggets: +220 },
    },
    openingLine: -250,
    closingLine: -275,
  },
  {
    id: "pick_003",
    game: "Bills @ Chiefs",
    sport: "NFL",
    time: "8:20 PM ET",
    pick: "Chiefs ML",
    modelProb: 0.62,
    confidence: "HIGH",
    bestOdds: -155,
    bestBook: "Caesars",
    bookOdds: {
      DraftKings: { chiefs: -160, bills: +135 },
      FanDuel:    { chiefs: -158, bills: +133 },
      BetMGM:     { chiefs: -162, bills: +137 },
      Caesars:    { chiefs: -155, bills: +130 },
    },
    openingLine: -140,
    closingLine: -158,
  },
  {
    id: "pick_004",
    game: "Eagles @ 49ers",
    sport: "NFL",
    time: "4:25 PM ET",
    pick: "Eagles +2.5",
    modelProb: 0.53,
    confidence: "MEDIUM",
    bestOdds: -105,
    bestBook: "DraftKings",
    bookOdds: {
      DraftKings: { eagles: -105, niners: -115 },
      FanDuel:    { eagles: -108, niners: -112 },
      BetMGM:     { eagles: -110, niners: -110 },
      Caesars:    { eagles: -107, niners: -113 },
    },
    openingLine: -110,
    closingLine: -105,
  },
];

// Season record stored in memory (swap for SQLite / Redis in production)
const seasonRecord = {
  wins: 24, losses: 18, pushes: 2,
  profit: 320.50,
  staked: 2200,
  picks: {}, // id -> { outcome, stake, profit }
};

// Simulated "live" lines (refreshed every 15 min in production from The Odds API)
let liveLines = JSON.parse(JSON.stringify(TODAYS_PICKS.map((p) => ({
  id: p.id,
  game: p.game,
  odds: p.bestOdds,
  lastSeen: p.bestOdds,
}))));

// ─── Math helpers ──────────────────────────────────────────────────────────────

function americanToDecimal(a) {
  return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
}

function impliedProb(american) {
  const dec = americanToDecimal(american);
  return 1 / dec;
}

/** Kelly fraction: f = (b*p - q) / b  where b = decimal odds - 1 */
function kelly(winProb, decimalOdds) {
  const b = decimalOdds - 1;
  const q = 1 - winProb;
  return Math.max(0, (b * winProb - q) / b);
}

/** Edge = model_prob - implied_prob (positive = value) */
function edge(modelProb, american) {
  return modelProb - impliedProb(american);
}

function formatOdds(n) { return n > 0 ? `+${n}` : `${n}`; }
function pct(n) { return `${(n * 100).toFixed(1)}%`; }
function money(n) { return `${n >= 0 ? "+" : ""}$${Math.abs(n).toFixed(2)}`; }

/** Detect arbitrage: given odds for both sides across all books, find best combo */
function findArbs(pick) {
  const books = Object.entries(pick.bookOdds);
  const sides = Object.values(pick.bookOdds[books[0][0]]);
  const sideKeys = Object.keys(pick.bookOdds[books[0][0]]);

  let bestArb = null;

  for (const [bookA, oddsA] of books) {
    for (const [bookB, oddsB] of books) {
      if (bookA === bookB) continue;
      for (const keyA of sideKeys) {
        for (const keyB of sideKeys) {
          if (keyA === keyB) continue;
          const oddA = oddsA[keyA];
          const oddB = oddsB[keyB];
          const probA = impliedProb(oddA);
          const probB = impliedProb(oddB);
          const combined = probA + probB;
          if (combined < 1) {
            const margin = (1 - combined) * 100;
            if (!bestArb || margin > bestArb.margin) {
              bestArb = { bookA, keyA, oddA, bookB, keyB, oddB, margin, combined };
            }
          }
        }
      }
    }
  }
  return bestArb;
}

/** CLV: positive if we got better than the closing line */
function clv(pick) {
  const ourImpl  = impliedProb(pick.bestOdds);
  const closeImpl = impliedProb(pick.closingLine);
  return closeImpl - ourImpl; // positive = beat the close
}

// ─── Embed builders ────────────────────────────────────────────────────────────

function confColor(c) {
  return c === "HIGH" ? Colors.Green : c === "MEDIUM" ? Colors.Yellow : Colors.Orange;
}

function pickEmbed(pick) {
  const e = edge(pick.modelProb, pick.bestOdds);
  const kf = kelly(pick.modelProb, americanToDecimal(pick.bestOdds));

  return new EmbedBuilder()
    .setColor(confColor(pick.confidence))
    .setTitle(`${pick.sport} · ${pick.game}`)
    .setDescription(`**${pick.pick}** · Best line: **${formatOdds(pick.bestOdds)}** @ ${pick.bestBook}`)
    .addFields(
      { name: "Confidence",  value: pick.confidence,                    inline: true },
      { name: "Win Prob",    value: pct(pick.modelProb),                inline: true },
      { name: "Edge",        value: `**+${pct(e)}**`,                   inline: true },
      { name: "Kelly Frac",  value: pct(kf),                            inline: true },
      { name: "Game Time",   value: pick.time,                          inline: true },
      { name: "ID",          value: `\`${pick.id}\``,                   inline: true }
    )
    .setFooter({ text: "AI Advantage · Log result with /result <id> <W|L|P>" })
    .setTimestamp();
}

function dailySummaryEmbed(picks) {
  const sorted = [...picks].sort(
    (a, b) => edge(b.modelProb, b.bestOdds) - edge(a.modelProb, a.bestOdds)
  );
  const highConf = picks.filter((p) => p.confidence === "HIGH").length;
  const avgEdge  = picks.reduce((s, p) => s + edge(p.modelProb, p.bestOdds), 0) / picks.length;

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle("📊 Today's AI Advantage Picks")
    .setDescription(
      `**${picks.length} games** · **${highConf} high-confidence** · Avg edge: **+${pct(avgEdge)}**\n` +
      `Sorted by edge — highest value first.`
    )
    .setTimestamp()
    .setFooter({ text: "Use /bet <game> <bankroll> for Kelly-sized stakes" });

  for (const p of sorted) {
    const e = edge(p.modelProb, p.bestOdds);
    embed.addFields({
      name: `${p.sport} · ${p.game} — ${p.time}`,
      value:
        `**${p.pick}** ${formatOdds(p.bestOdds)} @ ${p.bestBook}\n` +
        `Conf: ${p.confidence} · Win%: ${pct(p.modelProb)} · Edge: **+${pct(e)}** · \`${p.id}\``,
    });
  }
  return embed;
}

function weeklyEmbed(rec) {
  const total   = rec.wins + rec.losses + rec.pushes;
  const winRate = total > 0 ? (rec.wins / total) : 0;
  const roi     = rec.staked > 0 ? rec.profit / rec.staked : 0;
  const trending = roi > 0 ? "📈" : "📉";

  return new EmbedBuilder()
    .setColor(rec.profit >= 0 ? Colors.Green : Colors.Red)
    .setTitle(`${trending} Weekly AI Advantage Summary`)
    .addFields(
      { name: "Record",      value: `${rec.wins}W-${rec.losses}L-${rec.pushes}P`, inline: true },
      { name: "Win Rate",    value: pct(winRate),                                  inline: true },
      { name: "Net Profit",  value: money(rec.profit),                             inline: true },
      { name: "Total Staked",value: `$${rec.staked.toFixed(0)}`,                  inline: true },
      { name: "ROI",         value: `${roi >= 0 ? "+" : ""}${(roi * 100).toFixed(1)}%`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "AI Advantage Sports" });
}

function betSizeEmbed(pick, bankroll) {
  const dec = americanToDecimal(pick.bestOdds);
  const kf  = kelly(pick.modelProb, dec);
  const halfKf = kf / 2;
  const qtrKf  = kf / 4;

  const fullBet  = bankroll * kf;
  const halfBet  = bankroll * halfKf;
  const qtrBet   = bankroll * qtrKf;

  const ev = (pick.modelProb * (dec - 1) - (1 - pick.modelProb));

  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle(`💰 Bet Sizing: ${pick.game}`)
    .setDescription(`**${pick.pick}** @ ${formatOdds(pick.bestOdds)} (${pick.bestBook})`)
    .addFields(
      { name: "Your Bankroll",   value: `$${bankroll.toLocaleString()}`,            inline: false },
      { name: "Kelly Fraction",  value: pct(kf),                                    inline: true  },
      { name: "Edge",            value: `+${pct(edge(pick.modelProb, pick.bestOdds))}`, inline: true },
      { name: "EV per $100",     value: money(ev * 100),                             inline: true  },
      { name: "⚠️ Full Kelly",   value: `$${fullBet.toFixed(2)} — aggressive`,      inline: false },
      { name: "✅ Half Kelly",   value: `$${halfBet.toFixed(2)} — recommended`,     inline: false },
      { name: "🛡️ Quarter Kelly",value: `$${qtrBet.toFixed(2)} — conservative`,    inline: false },
    )
    .setFooter({ text: "Half Kelly gives ~70% of growth with far less ruin risk" })
    .setTimestamp();
}

function edgeRankEmbed(picks) {
  const sorted = [...picks]
    .map((p) => ({ ...p, edge: edge(p.modelProb, p.bestOdds) }))
    .sort((a, b) => b.edge - a.edge);

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle("🎯 Value Picks Ranked by Edge")
    .setDescription("Highest model edge vs. best available market price");

  for (const [i, p] of sorted.entries()) {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    embed.addFields({
      name: `${medal} ${p.game}`,
      value:
        `**${p.pick}** ${formatOdds(p.bestOdds)} @ ${p.bestBook}\n` +
        `Edge: **+${pct(p.edge)}** · Win%: ${pct(p.modelProb)} · ${p.confidence}`,
    });
  }

  embed.setFooter({ text: "Use /bet <game> <bankroll> to size your stake" });
  return embed;
}

function arbEmbed(picks) {
  const opps = [];
  for (const pick of picks) {
    const arb = findArbs(pick);
    if (arb) opps.push({ pick, arb });
  }

  if (!opps.length) {
    return new EmbedBuilder()
      .setColor(Colors.Grey)
      .setTitle("🔍 Arbitrage Scanner")
      .setDescription("No arb opportunities found in today's slate.\nLines are fairly aligned across books right now.");
  }

  const embed = new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle(`🤑 Arbitrage Opportunities — ${opps.length} Found`);

  for (const { pick, arb } of opps) {
    const stakeA = 100 / (1 + americanToDecimal(arb.oddA) / americanToDecimal(arb.oddB));
    const stakeB = 100 - stakeA;
    embed.addFields({
      name: pick.game,
      value:
        `**${arb.keyA}** ${formatOdds(arb.oddA)} @ ${arb.bookA} → Stake $${stakeA.toFixed(2)}\n` +
        `**${arb.keyB}** ${formatOdds(arb.oddB)} @ ${arb.bookB} → Stake $${stakeB.toFixed(2)}\n` +
        `✅ Guaranteed margin: **+${arb.margin.toFixed(2)}%** on $100`,
    });
  }
  embed.setFooter({ text: "Arb margins shrink fast — act quickly. Lines shown are estimates." });
  return embed;
}

function clvEmbed(picks) {
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle("📐 Closing Line Value (CLV) Report")
    .setDescription(
      "CLV measures whether today's model picks beat the closing market price.\n" +
      "Consistently beating the close is the strongest indicator of long-term edge."
    );

  const vals = picks.map((p) => ({ pick: p, clv: clv(p) }));
  const avgClv = vals.reduce((s, v) => s + v.clv, 0) / vals.length;

  for (const { pick: p, clv: c } of vals) {
    const icon = c > 0 ? "✅" : "❌";
    embed.addFields({
      name: `${icon} ${p.game} — ${p.pick}`,
      value:
        `Got: ${formatOdds(p.bestOdds)} · Close: ${formatOdds(p.closingLine)}\n` +
        `CLV: **${c > 0 ? "+" : ""}${pct(c)}** ${c > 0 ? "(beat the close)" : "(market moved against)"}`,
    });
  }

  embed.addFields({
    name: "Average CLV Today",
    value: `**${avgClv > 0 ? "+" : ""}${pct(avgClv)}**`,
  });

  embed.setFooter({
    text: avgClv > 0
      ? "Positive avg CLV — model is consistently finding value ✅"
      : "Negative avg CLV — consider reviewing model inputs",
  });
  return embed;
}

function kellyCalcEmbed(winRate, american, bankroll) {
  const dec = americanToDecimal(american);
  const kf  = kelly(winRate, dec);
  const ev  = winRate * (dec - 1) - (1 - winRate);

  if (kf <= 0) {
    return new EmbedBuilder()
      .setColor(Colors.Red)
      .setTitle("❌ No Edge Detected")
      .setDescription(
        `At a **${pct(winRate)}** win rate and **${formatOdds(american)}** odds, the expected value is **${money(ev * 100)} per $100**.\n` +
        `Kelly recommends **$0** — skip this bet.`
      );
  }

  return new EmbedBuilder()
    .setColor(Colors.Green)
    .setTitle("📐 Kelly Calculator")
    .addFields(
      { name: "Win Rate",      value: pct(winRate),              inline: true },
      { name: "Odds",          value: formatOdds(american),      inline: true },
      { name: "EV / $100",     value: money(ev * 100),           inline: true },
      { name: "Kelly %",       value: pct(kf),                   inline: true },
      { name: "Full Kelly",    value: `$${(bankroll * kf).toFixed(2)}`,      inline: true },
      { name: "Half Kelly ✅", value: `$${(bankroll * kf / 2).toFixed(2)}`, inline: true },
    )
    .setFooter({ text: "Bankroll: $" + bankroll.toLocaleString() });
}

// ─── Slash command definitions ─────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName("picks")
    .setDescription("Today's full AI pick slate, sorted by edge"),

  new SlashCommandBuilder()
    .setName("pick")
    .setDescription("Analysis for a specific game")
    .addStringOption((o) =>
      o.setName("game").setDescription("Part of the game name, e.g. 'Celtics'").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("edge")
    .setDescription("Rank today's picks by model edge — highest value first"),

  new SlashCommandBuilder()
    .setName("bet")
    .setDescription("Kelly-optimal bet size for a pick")
    .addStringOption((o) =>
      o.setName("game").setDescription("Part of the game name").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("bankroll").setDescription("Your current bankroll in USD").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("arb")
    .setDescription("Scan today's slate for arbitrage opportunities across sportsbooks"),

  new SlashCommandBuilder()
    .setName("clv")
    .setDescription("Closing Line Value report — are today's picks beating the market?"),

  new SlashCommandBuilder()
    .setName("kelly")
    .setDescription("Raw Kelly criterion calculator")
    .addNumberOption((o) =>
      o.setName("winrate").setDescription("Your estimated win probability (0–1)").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("odds").setDescription("American odds, e.g. -110 or +145").setRequired(true)
    )
    .addIntegerOption((o) =>
      o.setName("bankroll").setDescription("Current bankroll in USD").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("bankroll")
    .setDescription("Season stats: record, ROI, net profit"),

  new SlashCommandBuilder()
    .setName("result")
    .setDescription("Log the outcome of a pick")
    .addStringOption((o) =>
      o.setName("id").setDescription("Pick ID from the embed (e.g. pick_001)").setRequired(true)
    )
    .addStringOption((o) =>
      o.setName("outcome")
        .setDescription("W, L, or P")
        .setRequired(true)
        .addChoices(
          { name: "Win",  value: "W" },
          { name: "Loss", value: "L" },
          { name: "Push", value: "P" }
        )
    )
    .addIntegerOption((o) =>
      o.setName("stake").setDescription("Amount wagered in USD").setRequired(false)
    ),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Slash commands registered.");
}

// ─── Bot setup ─────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();

  // Daily picks at 10 AM
  cron.schedule("0 10 * * *", async () => {
    const ch = await client.channels.fetch(PICKS_CHANNEL_ID);
    await ch?.send({ embeds: [dailySummaryEmbed(TODAYS_PICKS)] });
    console.log("Posted daily picks.");
  });

  // Weekly summary Sunday 8 PM
  cron.schedule("0 20 * * 0", async () => {
    const ch = await client.channels.fetch(PICKS_CHANNEL_ID);
    await ch?.send({ embeds: [weeklyEmbed(seasonRecord)] });
    console.log("Posted weekly summary.");
  });

  // Line movement + value alerts every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    /**
     * In production: fetch fresh odds from The Odds API and compare to liveLines.
     * Here we simulate small random movements for demonstration.
     */
    const ch = await client.channels.fetch(PICKS_CHANNEL_ID);
    if (!ch) return;

    for (const live of liveLines) {
      const pick = TODAYS_PICKS.find((p) => p.id === live.id);
      if (!pick) continue;

      // Simulate a line move (production: real API data)
      const simulatedMove = Math.round((Math.random() - 0.5) * 20);
      const newOdds = live.odds + simulatedMove;
      const movement = Math.abs(newOdds - live.lastSeen);

      if (movement >= 5) {
        const direction = newOdds < live.lastSeen ? "📉 shortened (money coming in)" : "📈 drifted (market fading)";
        const alert = new EmbedBuilder()
          .setColor(Colors.Yellow)
          .setTitle("⚡ Line Movement Alert")
          .setDescription(
            `**${pick.game} — ${pick.pick}**\n` +
            `${formatOdds(live.lastSeen)} → **${formatOdds(newOdds)}** (${direction})\n` +
            `Movement: ${movement} pts`
          )
          .setTimestamp()
          .setFooter({ text: "Line data is simulated — connect real odds API for live alerts" });

        await ch.send({ embeds: [alert] });
        live.lastSeen = newOdds;
      }

      // Check if new odds create a fresh high-edge opportunity
      const newEdge = edge(pick.modelProb, newOdds);
      if (newEdge > 0.05 && newEdge > edge(pick.modelProb, live.odds)) {
        const valueAlert = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("🎯 Value Alert — Edge Improved!")
          .setDescription(
            `**${pick.game} — ${pick.pick}**\n` +
            `Line moved to **${formatOdds(newOdds)}** @ ${pick.bestBook}\n` +
            `Edge just jumped to **+${pct(newEdge)}** — model still likes this at new price.`
          )
          .setTimestamp()
          .setFooter({ text: "Use /bet to calculate Kelly stake" });
        await ch.send({ embeds: [valueAlert] });
      }

      live.odds = newOdds;
    }
  });
});

// ─── Interaction handler ───────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "picks") {
    return interaction.reply({ embeds: [dailySummaryEmbed(TODAYS_PICKS)] });
  }

  if (commandName === "edge") {
    return interaction.reply({ embeds: [edgeRankEmbed(TODAYS_PICKS)] });
  }

  if (commandName === "arb") {
    return interaction.reply({ embeds: [arbEmbed(TODAYS_PICKS)] });
  }

  if (commandName === "clv") {
    return interaction.reply({ embeds: [clvEmbed(TODAYS_PICKS)] });
  }

  if (commandName === "bankroll") {
    return interaction.reply({ embeds: [weeklyEmbed(seasonRecord)] });
  }

  if (commandName === "pick") {
    const query = interaction.options.getString("game").toLowerCase();
    const match = TODAYS_PICKS.find(
      (p) => p.game.toLowerCase().includes(query) || p.pick.toLowerCase().includes(query)
    );
    if (match) return interaction.reply({ embeds: [pickEmbed(match)] });
    return interaction.reply({ content: `No pick matching **${interaction.options.getString("game")}** today. Try \`/picks\`.`, ephemeral: true });
  }

  if (commandName === "bet") {
    const query    = interaction.options.getString("game").toLowerCase();
    const bankroll = interaction.options.getInteger("bankroll");
    const match    = TODAYS_PICKS.find((p) => p.game.toLowerCase().includes(query) || p.pick.toLowerCase().includes(query));
    if (!match) return interaction.reply({ content: `No pick matching that game. Try \`/picks\`.`, ephemeral: true });
    return interaction.reply({ embeds: [betSizeEmbed(match, bankroll)] });
  }

  if (commandName === "kelly") {
    const winRate  = interaction.options.getNumber("winrate");
    const odds     = interaction.options.getInteger("odds");
    const bankroll = interaction.options.getInteger("bankroll");
    if (winRate < 0 || winRate > 1) return interaction.reply({ content: "Win rate must be between 0 and 1.", ephemeral: true });
    return interaction.reply({ embeds: [kellyCalcEmbed(winRate, odds, bankroll)] });
  }

  if (commandName === "result") {
    const id      = interaction.options.getString("id");
    const outcome = interaction.options.getString("outcome");
    const stake   = interaction.options.getInteger("stake") ?? 10;

    const pick = TODAYS_PICKS.find((p) => p.id === id);
    if (!pick) return interaction.reply({ content: `No pick with ID \`${id}\`. Check the ID in the embed.`, ephemeral: true });

    const dec    = americanToDecimal(pick.bestOdds);
    let profit   = 0;
    if (outcome === "W") profit = stake * (dec - 1);
    if (outcome === "L") profit = -stake;

    seasonRecord.wins   += outcome === "W" ? 1 : 0;
    seasonRecord.losses += outcome === "L" ? 1 : 0;
    seasonRecord.pushes += outcome === "P" ? 1 : 0;
    seasonRecord.profit += profit;
    seasonRecord.staked += stake;
    seasonRecord.picks[id] = { outcome, stake, profit };

    const icon  = outcome === "W" ? "✅" : outcome === "L" ? "❌" : "↩️";
    const embed = new EmbedBuilder()
      .setColor(outcome === "W" ? Colors.Green : outcome === "L" ? Colors.Red : Colors.Grey)
      .setTitle(`${icon} Result Logged — ${pick.game}`)
      .setDescription(`**${pick.pick}** · ${formatOdds(pick.bestOdds)}`)
      .addFields(
        { name: "Outcome", value: outcome,         inline: true },
        { name: "Stake",   value: `$${stake}`,     inline: true },
        { name: "P&L",     value: money(profit),   inline: true },
        { name: "Season Record", value: `${seasonRecord.wins}W-${seasonRecord.losses}L-${seasonRecord.pushes}P`, inline: true },
        { name: "Season Profit", value: money(seasonRecord.profit), inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
