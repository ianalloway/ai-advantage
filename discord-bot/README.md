# AI Advantage Discord Bot

Posts daily AI pick alerts to Discord, tracks results, and responds to slash commands.

## Features

- Automatically posts today's picks to a channel at **10 AM** daily
- Posts a **weekly summary** (W/L/P, ROI) every Sunday at 8 PM
- `/picks` — show today's full pick slate
- `/pick <game>` — get analysis for a specific game
- `/bankroll` — view season stats

## Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers](https://discord.com/developers/applications)
2. Create a new application → Bot → copy the token
3. Enable **Server Members Intent** and **Message Content Intent**
4. OAuth2 → URL Generator → select `bot` + `applications.commands` scopes

### 2. Environment Variables

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
PICKS_CHANNEL_ID=the_channel_id_to_post_picks
```

### 3. Install & Run

```bash
cd discord-bot
npm install
node bot.js
```

## Deployment

For production, deploy to a always-on service:

- **Railway**: `railway up`
- **Fly.io**: `fly deploy`
- **Render**: Connect repo, set env vars, deploy

## Tracking Results

The bot currently uses an in-memory `seasonRecord` object. For persistent tracking across restarts, replace it with a simple database (e.g. SQLite via `better-sqlite3`, or a hosted DB).
