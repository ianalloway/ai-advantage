/**
 * AI Advantage Discord Bot — Issue #22
 *
 * Features:
 *  - Posts daily picks to a channel at 10 AM (server time)
 *  - Formats picks as rich embeds with confidence, odds, edge
 *  - Tracks results and posts a weekly summary every Sunday
 *  - /pick <game>  – get analysis for a specific game
 *  - /bankroll     – see season stats
 *
 * Setup:
 *   npm install discord.js node-cron
 *   DISCORD_TOKEN=xxx PICKS_CHANNEL_ID=yyy node bot.js
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

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PICKS_CHANNEL_ID = process.env.PICKS_CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !PICKS_CHANNEL_ID) {
  console.error(
    "Missing required env vars: DISCORD_TOKEN, DISCORD_CLIENT_ID, PICKS_CHANNEL_ID"
  );
  process.exit(1);
}

// ---------- Mock data (replace with real API calls) ----------

const TODAYS_PICKS = [
  {
    game: "Bucks @ Celtics",
    sport: "NBA",
    time: "7:30 PM ET",
    pick: "Celtics ML",
    odds: -205,
    winProb: 0.68,
    edge: 0.046,
    confidence: "HIGH",
  },
  {
    game: "Nuggets @ Thunder",
    sport: "NBA",
    time: "9:00 PM ET",
    pick: "Thunder ML",
    odds: -290,
    winProb: 0.74,
    edge: 0.031,
    confidence: "HIGH",
  },
  {
    game: "Bills @ Chiefs",
    sport: "NFL",
    time: "8:20 PM ET",
    pick: "Chiefs ML",
    odds: -168,
    winProb: 0.62,
    edge: 0.022,
    confidence: "MEDIUM",
  },
];

// Season record (persisted externally in production — use a DB)
let seasonRecord = { wins: 0, losses: 0, pushes: 0, profit: 0, staked: 0 };

// ---------- Helpers ----------

function formatOdds(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function confidenceColor(conf) {
  return conf === "HIGH" ? Colors.Green : conf === "MEDIUM" ? Colors.Yellow : Colors.Orange;
}

function buildPickEmbed(pick) {
  const edgePct = (pick.edge * 100).toFixed(1);
  const winPct = (pick.winProb * 100).toFixed(0);

  return new EmbedBuilder()
    .setColor(confidenceColor(pick.confidence))
    .setTitle(`${pick.sport} · ${pick.game}`)
    .setDescription(`**${pick.pick}** · ${formatOdds(pick.odds)}`)
    .addFields(
      { name: "Confidence", value: pick.confidence,        inline: true },
      { name: "Win Prob",   value: `${winPct}%`,           inline: true },
      { name: "Edge",       value: `+${edgePct}%`,         inline: true },
      { name: "Game Time",  value: pick.time,              inline: true }
    )
    .setFooter({ text: "AI Advantage · For informational purposes only" })
    .setTimestamp();
}

function buildDailySummaryEmbed(picks) {
  const highConf = picks.filter((p) => p.confidence === "HIGH").length;
  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle("📊 Today's AI Advantage Picks")
    .setDescription(
      `**${picks.length} games** · **${highConf} high-confidence** picks for today`
    )
    .setTimestamp()
    .setFooter({ text: "React with ✅ after pick wins or ❌ after loss" });

  for (const pick of picks) {
    embed.addFields({
      name: `${pick.sport} · ${pick.game} — ${pick.time}`,
      value: `**${pick.pick}** ${formatOdds(pick.odds)} | Conf: ${pick.confidence} | Edge: +${(pick.edge * 100).toFixed(1)}%`,
    });
  }
  return embed;
}

function buildWeeklyEmbed(record) {
  const total = record.wins + record.losses + record.pushes;
  const winRate = total > 0 ? ((record.wins / total) * 100).toFixed(0) : "—";
  const roi = record.staked > 0
    ? ((record.profit / record.staked) * 100).toFixed(1)
    : "—";

  return new EmbedBuilder()
    .setColor(record.profit >= 0 ? Colors.Green : Colors.Red)
    .setTitle("📈 Weekly AI Advantage Summary")
    .addFields(
      { name: "Record",   value: `${record.wins}W-${record.losses}L-${record.pushes}P`, inline: true },
      { name: "Win Rate", value: `${winRate}%`,   inline: true },
      { name: "Season ROI", value: `${roi}%`,     inline: true },
      { name: "Net Profit", value: `${record.profit >= 0 ? "+" : ""}$${record.profit.toFixed(0)}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: "AI Advantage Sports" });
}

// ---------- Slash commands ----------

const commands = [
  new SlashCommandBuilder()
    .setName("pick")
    .setDescription("Get AI analysis for a game")
    .addStringOption((opt) =>
      opt
        .setName("game")
        .setDescription('Game to analyze, e.g. "Celtics vs Bucks"')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("bankroll")
    .setDescription("View current season stats"),
  new SlashCommandBuilder()
    .setName("picks")
    .setDescription("Show today's AI picks"),
].map((cmd) => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
  console.log("Slash commands registered.");
}

// ---------- Bot ----------

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();

  // Daily picks at 10 AM (server timezone)
  cron.schedule("0 10 * * *", async () => {
    const channel = await client.channels.fetch(PICKS_CHANNEL_ID);
    if (!channel) return;
    await channel.send({ embeds: [buildDailySummaryEmbed(TODAYS_PICKS)] });
    console.log("Posted daily picks.");
  });

  // Weekly summary on Sunday at 8 PM
  cron.schedule("0 20 * * 0", async () => {
    const channel = await client.channels.fetch(PICKS_CHANNEL_ID);
    if (!channel) return;
    await channel.send({ embeds: [buildWeeklyEmbed(seasonRecord)] });
    console.log("Posted weekly summary.");
  });
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "picks") {
    await interaction.reply({
      embeds: [buildDailySummaryEmbed(TODAYS_PICKS)],
    });
  }

  if (interaction.commandName === "pick") {
    const query = interaction.options.getString("game").toLowerCase();
    const match = TODAYS_PICKS.find(
      (p) =>
        p.game.toLowerCase().includes(query) ||
        p.pick.toLowerCase().includes(query)
    );

    if (match) {
      await interaction.reply({ embeds: [buildPickEmbed(match)] });
    } else {
      await interaction.reply({
        content: `No pick found for **${interaction.options.getString("game")}** today. Try \`/picks\` for today's full slate.`,
        ephemeral: true,
      });
    }
  }

  if (interaction.commandName === "bankroll") {
    await interaction.reply({ embeds: [buildWeeklyEmbed(seasonRecord)] });
  }
});

client.login(TOKEN);
