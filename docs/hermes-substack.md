# Hermes → Substack publishing

`scripts/hermes-substack-publish.mjs` lets your Hermes agent (wherever it
runs — e.g. locally on your DappNode) publish posts to your Substack
publication (`allowayai.substack.com`).

This is a standalone script, not a deployed part of this app. Hermes invokes
it directly (cron, systemd timer, or ad hoc) with its own process and its own
credentials — nothing here goes through Netlify.

## Why a script instead of a repo API endpoint

Substack has no official public API. Publishing works by driving the same
undocumented JSON endpoints the Substack web editor itself calls
(`/api/v1/drafts`, `.../prepublish`, `.../publish`), authenticated with a
logged-in session cookie. Those endpoints can change without notice, and
using them may be outside what Substack's terms of service anticipate for
your own account — review Substack's current terms before relying on this
for anything unattended. Because of that fragility, this lives as a script
Hermes controls directly rather than a hosted endpoint other systems depend on.

## Setup

1. Copy the relevant vars from `env.example` into wherever Hermes reads its
   environment from (its own `.env`, systemd unit, etc — not this repo's
   Netlify env, since the script never runs there):

   ```bash
   SUBSTACK_PUBLICATION_URL=https://allowayai.substack.com
   SUBSTACK_SID=...
   SUBSTACK_CONNECT_SID=...
   ```

2. Get the two cookie values from a browser logged into Substack:
   DevTools → Application → Cookies → `https://substack.com` → copy the
   `substack.sid` and `connect.sid` values.

   These are session cookies — they expire, and rotate on password change or
   the occasional forced logout. When the script starts failing auth, refresh
   them the same way. As a fallback, `SUBSTACK_EMAIL` / `SUBSTACK_PASSWORD`
   makes the script log in fresh on every run, but Substack can require a
   captcha on scripted logins, so cookie auth is the reliable path.

## Usage

```bash
node scripts/hermes-substack-publish.mjs post.json          # draft only (safe default)
node scripts/hermes-substack-publish.mjs post.json --publish # creates draft AND publishes it
node scripts/hermes-substack-publish.mjs post.json --dry-run # no network calls, just prints the payload
```

`post.json`:

```json
{
  "title": "Post title",
  "subtitle": "Optional subtitle",
  "body": "Markdown content...\n\nSupports **bold**, *italic*, `code`, [links](https://example.com), lists, blockquotes, and fenced code blocks.",
  "sendEmail": true,
  "shareSocial": false
}
```

`body` is Markdown (a practical subset — see
`scripts/lib/substack-markdown.mjs`), converted to the ProseMirror JSON
structure Substack's draft API expects.

## Safety model

- **Draft-only by default.** Without `--publish`, the script only creates a
  Substack draft and prints its edit URL (`{pub}/publish/post/{id}`) — no
  subscriber ever sees it. Publishing (and emailing your list) requires the
  explicit `--publish` flag.
- **`sendEmail` / `shareSocial`** default to `true` / `false` when
  publishing (matching Substack's own default), overridable per-post in
  `post.json` or via `SUBSTACK_SEND_EMAIL` / `SUBSTACK_SHARE_SOCIAL` env vars.
- Non-zero exit code on any failure (bad auth, bad payload, network error),
  so Hermes/cron can detect and alert on failed runs.

## Example: Hermes cron on the DappNode

```bash
# crontab -e
0 9 * * * cd /path/to/hermes && node ai-advantage/scripts/hermes-substack-publish.mjs \
  out/todays-post.json --publish >> /var/log/hermes-substack.log 2>&1
```

Point Hermes at generating `post.json`; this script is only the last-mile
delivery step into Substack.
