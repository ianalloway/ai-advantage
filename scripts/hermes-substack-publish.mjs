#!/usr/bin/env node
// Standalone publisher for the Hermes agent (runs wherever Hermes lives, e.g.
// on your DappNode) to push a post into your Substack publication.
//
// This is NOT part of the deployed app or Netlify functions — it's a script
// Hermes invokes directly (cron, systemd timer, or ad hoc) with its own
// process and its own credentials. Substack has no official public API; this
// drives the same undocumented JSON endpoints the Substack web editor uses,
// authenticated with a logged-in session cookie. See docs/hermes-substack.md
// for setup and the safety model.
//
// Usage:
//   node scripts/hermes-substack-publish.mjs <post.json> [--publish] [--dry-run]
//
// Without --publish, the script only creates/updates a Substack draft and
// prints its edit URL — nothing goes out to subscribers. --publish is
// required to actually publish (and, by default, email your list).
import { readFile } from "node:fs/promises";
import { markdownToProseMirrorDoc } from "./lib/substack-markdown.mjs";

function parseArgs(argv) {
  const args = { publish: false, dryRun: false, file: null };
  for (const arg of argv) {
    if (arg === "--publish") args.publish = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!arg.startsWith("-")) args.file = arg;
    else throw new Error(`Unknown flag: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/hermes-substack-publish.mjs <post.json> [--publish] [--dry-run]

post.json shape:
  {
    "title": "Post title",           // required
    "subtitle": "Optional subtitle", // optional
    "body": "Markdown content...",   // required
    "sendEmail": true,               // optional, overrides SUBSTACK_SEND_EMAIL
    "shareSocial": false             // optional, overrides SUBSTACK_SHARE_SOCIAL
  }

Flags:
  --publish   Actually publish the draft (default: create/update draft only)
  --dry-run   Build the request payload and print it; no network calls

Env vars (see env.example):
  SUBSTACK_PUBLICATION_URL   e.g. https://allowayai.substack.com
  SUBSTACK_SID               "substack.sid" cookie value
  SUBSTACK_CONNECT_SID       "connect.sid" cookie value
  SUBSTACK_EMAIL / SUBSTACK_PASSWORD   fallback login if cookies aren't set
  SUBSTACK_SEND_EMAIL         default "true" when --publish is used
  SUBSTACK_SHARE_SOCIAL       default "false" when --publish is used
`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizePublicationUrl(rawUrl) {
  const url = new URL(rawUrl);
  return `${url.protocol}//${url.host}`;
}

function publicationSubdomain(baseUrl) {
  const host = new URL(baseUrl).hostname;
  return host.endsWith(".substack.com") ? host.split(".")[0] : host;
}

async function resolveCookieHeader(baseUrl) {
  const sid = process.env.SUBSTACK_SID;
  const connectSid = process.env.SUBSTACK_CONNECT_SID;
  if (sid && connectSid) {
    return `connect.sid=${connectSid}; substack.sid=${sid}`;
  }

  const email = process.env.SUBSTACK_EMAIL;
  const password = process.env.SUBSTACK_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No auth available. Set SUBSTACK_SID + SUBSTACK_CONNECT_SID (recommended) " +
        "or SUBSTACK_EMAIL + SUBSTACK_PASSWORD. See docs/hermes-substack.md.",
    );
  }

  const response = await fetch("https://substack.com/api/v1/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password,
      redirect: "/",
      for_pub: publicationSubdomain(baseUrl),
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Login failed (${response.status}). Substack may be blocking scripted logins with a ` +
        `captcha — use SUBSTACK_SID/SUBSTACK_CONNECT_SID instead. Response: ${text.slice(0, 300)}`,
    );
  }

  const setCookies = response.headers.getSetCookie?.() ?? [];
  const cookiePairs = setCookies
    .map((cookie) => cookie.split(";")[0])
    .filter((pair) => pair.startsWith("connect.sid=") || pair.startsWith("substack.sid="));

  if (cookiePairs.length < 2) {
    throw new Error("Login succeeded but session cookies were not returned as expected.");
  }

  return cookiePairs.join("; ");
}

async function substackFetch(baseUrl, cookieHeader, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      cookie: cookieHeader,
      "content-type": "application/json",
      ...init.headers,
    },
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(
      `Substack API ${init.method ?? "GET"} ${path} failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  return json;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const raw = await readFile(args.file, "utf8");
  const post = JSON.parse(raw);
  if (!post.title) throw new Error("post.json is missing required field: title");
  if (!post.body) throw new Error("post.json is missing required field: body");

  const baseUrl = normalizePublicationUrl(requireEnv("SUBSTACK_PUBLICATION_URL"));
  const draftBody = markdownToProseMirrorDoc(post.body);

  const draftPayload = {
    draft_title: post.title,
    draft_subtitle: post.subtitle ?? "",
    draft_body: JSON.stringify(draftBody),
    type: "newsletter",
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ baseUrl, draftPayload, willPublish: args.publish }, null, 2));
    return;
  }

  const cookieHeader = await resolveCookieHeader(baseUrl);

  const draft = await substackFetch(baseUrl, cookieHeader, "/api/v1/drafts", {
    method: "POST",
    body: JSON.stringify(draftPayload),
  });
  const draftId = draft.id;
  if (!draftId) throw new Error(`Draft create response had no id: ${JSON.stringify(draft)}`);

  // Substack requires prepublish to run before a draft can be published.
  await substackFetch(baseUrl, cookieHeader, `/api/v1/drafts/${draftId}/prepublish`);

  if (!args.publish) {
    console.log(
      JSON.stringify(
        {
          status: "draft",
          id: draftId,
          editUrl: `${baseUrl}/publish/post/${draftId}`,
        },
        null,
        2,
      ),
    );
    return;
  }

  const sendEmail = post.sendEmail ?? (process.env.SUBSTACK_SEND_EMAIL ?? "true") === "true";
  const shareSocial =
    post.shareSocial ?? (process.env.SUBSTACK_SHARE_SOCIAL ?? "false") === "true";

  const published = await substackFetch(baseUrl, cookieHeader, `/api/v1/drafts/${draftId}/publish`, {
    method: "POST",
    body: JSON.stringify({ send: sendEmail, share_automatically: shareSocial }),
  });

  console.log(
    JSON.stringify(
      {
        status: "published",
        id: draftId,
        url: published.canonical_url ?? `${baseUrl}/p/${published.slug ?? draftId}`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[hermes-substack-publish] ${error.message}`);
  process.exit(1);
});
