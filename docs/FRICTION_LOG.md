# Friction log

Submitted with *Once Upon a Voice* for the Build, Ship, Shape: Amazon Developer Hackathon (Alexa+ track,
self-hosted MCP server). Each entry: the task attempted, the steps taken, expected vs. actual, a severity
rating, the workaround used, and a suggestion. Entries 1–7 were hit while building this server; 8 and 9
are labelled as research or out of the track's scope.

## 1. A tool result has no place for "try again in a moment"

- **Task:** let the host tell a child "say your choice again in a moment" when a `choose_path` call is
  rate-limited, and "that's all for today" when the daily quota is spent.
- **Steps:** the story backend limits continuations to 5 per minute per account (every judge shares one
  demo account). We returned rate-limited turns as `isError` results with spoken text and tried to add a
  `{status, code, retryable}` payload the host could read.
- **Expected:** a standard field on `CallToolResult` for "this will work if you retry" vs. "this will
  never work".
- **Actual:** the spec says that when a tool declares an `outputSchema`, `structuredContent` MUST match
  it, with no carve-out for error results. `@modelcontextprotocol/sdk` 1.30.1 skips output validation
  server-side when `isError` is set, but the client still validates `structuredContent` against the
  schema if present, so an error payload that does not look like a success is rejected. Our own demo page
  dropped the open story on every error. (Hit 2026-09-28.)
- **Severity:** Medium.
- **Workaround:** the retry hint lives under `_meta.ouyc` (`{status, code, retryable}`); our page reads
  it and keeps the story open on retryable errors. No other host will.
- **Suggestion:** a small standard error shape on `CallToolResult` (at least `retryable` and
  `retryAfterMs`, the way HTTP has `Retry-After`), and spec text saying whether `outputSchema` applies to
  error results at all.

## 2. The SDK's Express helper turns a `host` setting into a bare 403

- **Task:** run the server behind a public hostname on Railway.
- **Steps:** the local `.env` had `HOST=127.0.0.1`; we called `createMcpExpressApp({ host })` and tested
  with a public `Host` header, then deployed.
- **Expected:** a 200, or a 403 that says why.
- **Actual:** `host: "127.0.0.1"` switches on DNS-rebinding protection, and every request whose `Host` is
  a public domain is refused with a 403 and no log line naming the check. The same build bound to
  `0.0.0.0` returned 200 and logged that rebinding protection was off. The behaviour lives only in the
  helper's JSDoc. (Hit 2026-09-28; cost about an hour.)
- **Severity:** Medium (first deploy blocked until found).
- **Workaround:** leave `HOST` unset on Railway (default `0.0.0.0`); documented in the README.
- **Suggestion:** name the check and the allowed hosts in the 403 body, log it once at startup, and cover
  `allowedHosts` in the deployment docs.

## 3. MCP cannot say "read this aloud verbatim", and a server cannot ask what the host renders

- **Task:** return story text that a voice host reads word for word (numbered choices, the goodnight
  line, no stage directions), and offer MP3 narration only when the host can play audio.
- **Steps:** looked for a content annotation or client capability covering spoken delivery and rendered
  content types; built `narrate` as a separate tool returning a base64 `audio` block.
- **Expected:** an annotation like "speak as written", and something in `initialize` saying whether the
  host renders text, audio, or both.
- **Actual:** content annotations cover `audience` and `priority` only; nothing says verbatim vs.
  summarise, and nothing tells the server what the host renders. (Hit 2026-09-25 to 09-28.)
- **Severity:** Medium.
- **Workaround:** all speech shaping is server-side (`src/voice.ts`, an age-banded rewrite layer), "read
  aloud verbatim" is repeated in every tool description, and `narrate` is a tool the host may ignore.
- **Suggestion:** a text annotation for verbatim/spoken delivery, and a client capability listing the
  content types the host actually renders.

## 4. Bearer auth is the practical choice for a hobby-scale server, and hosts don't agree on it

- **Task:** lock the server so that only the family (or the judges) can reach it.
- **Steps:** used a shared secret in `Authorization: Bearer`; then tried to add the server to a second
  host's custom-connector form.
- **Expected:** a header field in the connector form.
- **Actual:** the form had none, so we added a `/mcp/<secret>` URL form, which puts the key in proxy logs
  and screen recordings. (Hit 2026-09-28.)
- **Severity:** Low.
- **Workaround:** both forms are supported; the key is rotated after every demo.
- **Suggestion:** a documented "simple bearer" pattern in the transport docs, and a header field in host
  connector forms.

## 5. No documented route from a self-hosted MCP server to a real Alexa+ device

- **Task:** show the server working on its intended device, as the video rule asks.
- **Steps:** read the rules and the Resources page; looked for a preview console, account-linking flow or
  endpoint registration for self-hosted MCP servers.
- **Expected:** a way to point Alexa+ at our endpoint, even in a sandbox.
- **Actual:** the Resources page offers an Agent Skills link, the MCP transport spec, and a note that a
  web app may simulate an Alexa+ experience. There is no described way to connect a real device. (Hit
  2026-09-28.)
- **Severity:** High for this track (it decides what the video can show).
- **Workaround:** built a simulated Alexa+ page, a browser MCP client, and say so on screen.
- **Suggestion:** state plainly what the intended device is for a self-hosted MCP entry, and link a
  preview console or account-linking path if one exists.

## 6. Choosing between the three paths took longer than building on one

- **Task:** pick between Agent Skill, self-hosted MCP server and simulated web app.
- **Steps:** compared what each could demo, what access each needs, and how the video rule applies.
- **Expected:** a short comparison.
- **Actual:** the three are presented as alternatives, but only one has a documented device story and
  only one is testable end to end today. (Hit 2026-09-24.)
- **Severity:** Low.
- **Workaround:** chose the self-hosted MCP path and simulated the device.
- **Suggestion:** a table of the three paths against what you can demo, what access you need, and how
  the video rule applies to each.

## 7. Streamable HTTP answers as JSON or SSE, so a minimal browser client needs an SSE parser

- **Task:** write the smallest possible browser MCP client for the simulated page.
- **Steps:** POSTed JSON-RPC with `Accept: application/json, text/event-stream`.
- **Expected:** a JSON body.
- **Actual:** either a JSON body or an SSE stream, depending on the server; the client has to handle
  both. (Hit 2026-09-27.)
- **Severity:** Low.
- **Workaround:** a small SSE frame parser in the page.
- **Suggestion:** a reference minimal client in the docs.

## 8. (Research, not hit hands-on) Today's third-party voice modes do not call custom MCP tools

The voice modes of the large assistants do not call custom MCP tools (anthropics/claude-ai-mcp#146,
closed "not planned"; community reports for ChatGPT voice), so a voice-first MCP server can only be
demoed by text or dictation in those hosts. That is the gap Alexa+ would fill; it also meant there was no
second voice host to test against.

## 9. (Hosting, out of the track's scope) Railway's GitHub connection failed

`railway add --repo` failed with a bare "Unauthorized" because Railway's GitHub app had no access to the
repo. `railway up` from the local tree works, at the cost of push-to-deploy. Severity: Low.
