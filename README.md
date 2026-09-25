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

Auth: backend access tokens live about an hour, so the server keeps itself signed in with the refresh token and, failing that, re-mints the anonymous session by `OUYC_CLIENT_ID`. Set the client id and the server survives restarts and token expiry on its own.

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
- Bedtime (linear) stories count against the account's quota (free tier: 3 a day, 5 a month). Adventures do not.

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
