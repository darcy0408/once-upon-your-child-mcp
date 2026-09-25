/**
 * Live end-to-end test through the MCP server against the real backend.
 * Costs real model calls: one adventure (opening + up to N turns), one
 * bedtime story, one short narration.
 *
 *   npm run dev            # server, with OUYC_TOKEN in .env
 *   npx tsx scripts/live.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3333}/mcp`);
const MAX_TURNS = Number(process.env.LIVE_TURNS ?? 2);
const HERO = process.env.LIVE_HERO ?? "Maya";

type ToolResult = { isError?: boolean; content: { type: string; text?: string; data?: string }[]; structuredContent?: any };

const client = new Client({ name: "live", version: "0.0.1" });
await client.connect(new StreamableHTTPClientTransport(url));

async function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const t0 = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  console.log(`\n=== ${name} ${JSON.stringify(args)} (${((Date.now() - t0) / 1000).toFixed(1)}s)${r.isError ? " ERROR" : ""}`);
  console.log(text.length > 1200 ? text.slice(0, 1200) + `\n… [${text.length} chars]` : text);
  if (r.isError) throw new Error(`${name} failed: ${text}`);
  return r;
}

await tool("list_heroes", {});

const start = await tool("start_adventure", {
  hero: HERO,
  theme: "Under the sea",
  feeling: "nervous about her first swim lesson tomorrow",
  length: "short",
});
let storyId = start.structuredContent.story_id as string;
let ending = start.structuredContent.is_ending as boolean;
const spoken = ["two", "the first one", "let's find Pip the star dog"];
for (let i = 0; i < MAX_TURNS && !ending; i++) {
  const r = await tool("choose_path", { story_id: storyId, choice: spoken[i % spoken.length] });
  ending = r.structuredContent.is_ending as boolean;
}
console.log(`\nadventure ${storyId}: ${ending ? "reached the ending" : "still open after " + MAX_TURNS + " turns"}`);

await tool("tell_bedtime_story", { hero: HERO, feeling: "missing grandma", minutes: 3, mood: "calming" });

const n = await tool("narrate", { text: "Once upon a time, Maya and Pip found a glowing shell at the bottom of the sea." });
const audio = n.content.find((c) => c.type === "audio");
console.log(`audio block: ${audio ? `${Math.round((audio.data?.length ?? 0) * 0.75 / 1024)} KB mp3` : "MISSING"}`);

await client.close();
