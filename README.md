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
| `start_adventure` | Opens a Pick-a-Path story for a hero. Returns speech plus numbered choices. |
| `choose_path` | Continues with what the child said: "two", "the cave", or their own idea. |
| `tell_bedtime_story` | A complete wind-down story sized to N minutes, with an optional feelings theme. |
| `narrate` | MP3 narration in the app's child-safe storyteller voices, for hosts that play audio. |
| `list_voices` | Available narration voices. |

One prompt, `bedtime`, gives a host a ready-made opening.

Every tool returns text meant to be read aloud verbatim. Alexa+ is the narrator; the app is the author.

## Run it

```bash
cp .env.example .env     # set OUYC_TOKEN or leave blank for an anonymous session
npm install
npm run dev              # http://0.0.0.0:3333/mcp  (Streamable HTTP, spec 2025-11-25)
npm run smoke            # in a second terminal: lists tools over HTTP
SMOKE_LIVE=1 npm run smoke   # also calls the backend (public voices endpoint)
```

Production: `npm run build && npm start`. Railway and similar hosts set `PORT`.

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

## Safety notes for a kids' voice experience

- The child's name and feelings are sent only to the app's own backend, which already handles them under its privacy policy.
- The premium ElevenLabs voice is hard-gated off for under-13 accounts by the backend, regardless of what this server asks for.
- The server keeps only an in-memory map of open story choices; no story content is stored here.

## Status

- 2026-09-24: scaffolded; tool surface and transport verified against the MCP SDK (protocol 2025-11-25).
- 2026-09-25: full loop verified live against the production backend through the MCP server: `list_heroes`, a three-scene `start_adventure` / `choose_path` run answered with "two" and "the first one", a `tell_bedtime_story`, and `narrate` returning an MP3 audio block. See `scripts/live.ts`.

Demo account setup is in `scripts/setup-parent.ts` (anonymous session, adult declared age, one hero).

## License

MIT
