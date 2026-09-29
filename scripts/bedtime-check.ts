/**
 * Verifies OUYC PR #73 live: does a bedtime story actually honour tonight's
 * feeling and the child's comfort item?
 *
 * Deliberately narrower than personas.ts, which also POSTs /create-character
 * to the shared production account. This only calls tell_bedtime_story on a
 * hero that already exists. Costs one story against the daily quota.
 *
 *   MCP_URL=http://127.0.0.1:3399/mcp MCP_SHARED_SECRET=... npx tsx scripts/bedtime-check.ts
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { mcpTransport, mcpUrl } from "./mcp-transport.js";

const HERO = process.env.CHECK_HERO ?? "Maya";
const FEELING = process.env.CHECK_FEELING ?? "missing grandma";
// Words that should appear if the patch is live: the feeling from the request
// and the comfort item stored on the hero.
const EXPECT = (process.env.CHECK_EXPECT ?? "grandma,Bloo").split(",").map((s) => s.trim());

type ToolResult = { isError?: boolean; content: { type: string; text?: string }[]; structuredContent?: any };

const client = new Client({ name: "bedtime-check", version: "0.0.1" });
await client.connect(mcpTransport(mcpUrl()));

const t0 = Date.now();
const r = (await client.callTool({
  name: "tell_bedtime_story",
  arguments: { hero: HERO, feeling: FEELING, minutes: 3, mood: "calming" },
})) as ToolResult;
const text = r.content.find((c) => c.type === "text")?.text ?? "";

console.log(`tell_bedtime_story hero=${HERO} feeling=${JSON.stringify(FEELING)} (${((Date.now() - t0) / 1000).toFixed(1)}s)${r.isError ? " ERROR" : ""}`);
if (r.isError) {
  console.log(text);
  process.exit(1);
}

const hay = text.toLowerCase();
console.log(`\nwords: ${text.split(/\s+/).length}`);
for (const word of EXPECT) {
  const hit = hay.includes(word.toLowerCase());
  console.log(`  ${hit ? "FOUND   " : "MISSING "} ${word}`);
}

console.log(`\n--- story ---\n${text}`);
await client.close();
