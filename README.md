# Once Upon YOUR Child — MCP server for Alexa+

A self-hosted [Model Context Protocol](https://modelcontextprotocol.io) server that lets a voice agent such as **Alexa+** tell personalized, feelings-aware bedtime stories from [Once Upon YOUR Child](https://onceuponyourchild.app).

The child already has heroes in the app: a name, an age, a comfort item, buddies, fears and strengths. This server exposes those heroes and the app's story engine as MCP tools, so a parent can say:

> "Alexa, tell Maya a bedtime story. She's worried about her first swim lesson."

and get a choose-your-own-path story about *her* hero, calibrated to *her* age, with choices she answers by voice.

Built for the **Alexa+ track** of the Amazon Build, Ship, Shape hackathon (2026).

## Tools

| Tool | What it does |
|---|---|
| `list_heroes` | The family's saved heroes, so the agent can ask "which hero tonight?" |
| `start_adventure` | Opens a Pick-a-Path story for a hero. Returns speech plus choices phrased for the hero's age. |
| `choose_path` | Continues with what the child said: "two", "the cave", "the last one", or their own idea. |
| `tell_bedtime_story` | A complete wind-down story sized to N minutes, with the hero's buddies along. |
| `narrate` | MP3 narration in the app's child-safe storyteller voices, for hosts that play audio. |
| `list_voices` | Available narration voices. |

One prompt, `bedtime`, gives a host a ready-made opening.

Every tool returns text meant to be read aloud verbatim. Alexa+ is the narrator; the app is the author.

## Written for the child's age

The app groups children into bands (Sprout ≤5, Explorer 6–8, Adventurer 9–12, Creator 13–14) and the backend writes each scene for that band: sentence length, vocabulary, story depth and number of choices. This server adapts the *spoken* frame to match:

| Band | Choices asked as | Default path | Ending |
|---|---|---|---|
| Sprout | "Theo, which one? Follow the light, or call softly to it?" (no numbers) | short, 4 scenes | "The end. Sweet dreams, Theo." |
| Explorer | "What should happen next? One: … Two: … Or tell me your own idea." | medium, 6 scenes | "The end. Sweet dreams, Maya." |
| Adventurer | numbered, up to three choices, "Or say your own idea." | medium, 7 scenes | "The end. Goodnight, Zara." |
| Creator | numbered, up to three or four choices | medium, 8 scenes | "The end." |

Long choice texts are trimmed to their first clause for the ear (the full text stays in `structuredContent`), and the model's own trailing nudges ("What will you do next?", a restatement of the choices) are stripped so a child hears the question once. Errors are spoken too: a quota hit becomes "Maya's storybook is resting for tonight."

## Run it

```bash
cp .env.example .env
npx tsx scripts/setup-parent.ts   # creates a parent account + one hero; paste the printed ids into .env
npm install
npm run dev                       # http://0.0.0.0:3333/mcp  (Streamable HTTP, spec 2025-11-25)
npm run smoke                     # in a second terminal: lists tools over HTTP
npm run check:voice               # offline checks of the read-aloud helpers
npx tsx scripts/personas.ts       # live: one hero per age band through the server (costs model calls)
```

Production: `npm run build && npm start`. Railway and similar hosts set `PORT`.

Deploying on Railway (`railway.json` sets the build, start command and `/healthz` health check):

1. New project from this GitHub repo.
2. Variables: `MCP_SHARED_SECRET` (required; the server exits without it), `OUYC_CLIENT_ID` (so it can sign itself back in), optionally `OUYC_REFRESH_TOKEN` and `OUYC_DEFAULT_VOICE_ID`. Leave `PORT` and `HOST` unset: Railway supplies the port, and the default `0.0.0.0` bind is what lets requests with the public hostname through (binding to `127.0.0.1` turns on the SDK's localhost-only Host check and every public request gets a 403).
3. Generate a public domain, then check `https://<domain>/healthz`, and open `https://<domain>/` for the simulated Alexa+ page with the same secret.

### The simulated Alexa+ page

With the server running, open `http://localhost:3333/` (served from `web/index.html`, one static file, no build). It is a browser-side MCP client: it sends `initialize`, `tools/list` and `tools/call` to the same `POST /mcp` a voice host would, and plays the part of Alexa+ with a small rule-based router (who the hero is, adventure or bedtime, theme, feeling). It asks once for the demo key (`MCP_SHARED_SECRET`; leave blank if the server has none) and keeps it in `sessionStorage`.

Voice in uses the Web Speech API, so speech recognition needs Chrome or Edge on `https://` or `localhost`; the text box always works. Voice out uses the `narrate` tool (the app's storyteller voices, MP3) with the browser's own voice as a fallback and a checkbox to prefer it. Every MCP call shows up in the transcript with its timing so a judge can see the protocol at work.

Locking the endpoint: set `MCP_SHARED_SECRET` and every `POST /mcp` must carry `Authorization: Bearer <that secret>`; anything else gets a 401. It is optional on your own machine, but the server refuses to start without it on Railway (or with `NODE_ENV=production`), because whoever reaches an open endpoint becomes the demo parent. The check scripts read the same variable from `.env` and send the header themselves. `GET /healthz` stays public.

Hosts whose connector setup takes only a URL (no custom headers), such as the free tier of the Claude app, can use `https://<host>/mcp/<MCP_SHARED_SECRET>` instead; it is the same endpoint with the secret as the last path segment. A URL is easier to leak than a header (it can show up in proxy logs, history and screenshots), so treat that URL as the secret itself and rotate `MCP_SHARED_SECRET` after the demo.

Auth to the app: backend access tokens live about an hour, so the server keeps itself signed in with the refresh token and, failing that, re-mints the anonymous session by `OUYC_CLIENT_ID`. Set the client id and the server survives restarts and token expiry on its own.

## How it talks to the app

```
Alexa+  ──MCP (Streamable HTTP)──▶  this server  ──HTTPS──▶  Once Upon YOUR Child backend
                                                          /get-characters
                                                          /generate-interactive-story
                                                          /continue-interactive-story
                                                          /generate-story (bedtime_mode)
                                                          /tts/synthesize
```

The server carries a bearer token for **one parent account**. It never bypasses the backend's gates:

- Story and narration routes sit behind the app's parental-consent check.
- Age calibration is enforced server-side from the hero's verified age.
- Free-text choices ("something else") are wrapped as story input, never as instructions.
- Voice-only mode: `include_images: false`, so no illustration is generated that nobody will see.
- Bedtime (linear) stories count against the account's quota (free tier: 3 a day, 5 a month). Adventures may count too; check the app's current quota rules.

## Safety notes for a kids' voice experience

- The child's name and feelings are sent only to the app's own backend, which already handles them under its privacy policy.
- The premium ElevenLabs voice is hard-gated off for under-13 accounts by the backend, regardless of what this server asks for.
- The server keeps only an in-memory map of open story choices; no story content is stored here.

## Status

- 2026-09-24: scaffolded; tool surface and transport verified against the MCP SDK (protocol 2025-11-25).
- 2026-09-25: full loop verified live against the production backend through the MCP server: `list_heroes`, a three-scene `start_adventure` / `choose_path` run answered with "two" and "the first one", a `tell_bedtime_story`, and `narrate` returning an MP3 audio block. See `scripts/live.ts`.
- 2026-09-25: age-band walkthrough (`scripts/personas.ts`) with heroes aged 4, 6, 10 and 13. Added age-aware choice phrasing, clause-trimmed labels, echo/nudge stripping, spoken errors, refresh-token auth, and hero details on bedtime stories.

Demo account setup is in `scripts/setup-parent.ts` (anonymous session, adult declared age, one hero).

## License

MIT
