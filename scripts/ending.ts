/**
 * Runs one adventure to its ending and verifies the two things the handoff
 * asked about: is_completed handling and the closing line.
 *
 * Adventure only — no bedtime story, no narration — so it spends as little of
 * the demo account as possible.
 *
 *   PORT=3399 MCP_SHARED_SECRET=... npx tsx src/index.ts
 *   MCP_URL=http://127.0.0.1:3399/mcp MCP_SHARED_SECRET=... npx tsx scripts/ending.ts
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { OuycClient } from "../src/ouyc-client.js";
import { endingLine } from "../src/voice.js";
import { mcpTransport, mcpUrl } from "./mcp-transport.js";

const MAX_TURNS = Number(process.env.LIVE_TURNS ?? 6);
const HERO = process.env.LIVE_HERO ?? "Maya";

type ToolResult = {
  isError?: boolean;
  content: { type: string; text?: string }[];
  structuredContent?: any;
};

const client = new Client({ name: "ending", version: "0.0.1" });
await client.connect(mcpTransport(mcpUrl()));

async function tool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const t0 = Date.now();
  const r = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = r.content.find((c) => c.type === "text")?.text ?? "";
  if (r.isError) throw new Error(`${name} failed: ${text}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  return r;
}

const start = await tool("start_adventure", {
  hero: HERO,
  theme: "Under the sea",
  feeling: "nervous about her first swim lesson tomorrow",
  length: "short",
});

let storyId = start.structuredContent.story_id as string;
let ending = start.structuredContent.is_ending as boolean;
const hero = start.structuredContent.hero as { name: string; age: number | null } | undefined;
console.log(`story_id ${storyId}  hero ${hero?.name} (${hero?.age})  is_ending ${ending}  choices ${start.structuredContent.choices.length}`);

const spoken = ["two", "the first one", "let's find Pip the star dog"];
let turns = 0;
let finalSpeech = start.structuredContent.speech as string;

for (let i = 0; i < MAX_TURNS && !ending; i++) {
  const said = spoken[i % spoken.length];
  console.log(`\nturn ${i + 1}: child says "${said}"`);
  const r = await tool("choose_path", { story_id: storyId, choice: said });
  ending = r.structuredContent.is_ending as boolean;
  finalSpeech = r.structuredContent.speech as string;
  turns = i + 1;
  console.log(`  is_ending ${ending}  choices ${r.structuredContent.choices.length}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(ending ? `REACHED THE ENDING after ${turns} turns` : `STILL OPEN after ${MAX_TURNS} turns`);
console.log(`${"=".repeat(60)}`);

if (ending) {
  const expected = endingLine({ age: hero?.age ?? undefined, heroName: hero?.name });
  const tail = finalSpeech.trimEnd().slice(-120);
  console.log(`\nexpected closing line: ${JSON.stringify(expected)}`);
  console.log(`actual tail:           ${JSON.stringify(tail)}`);
  console.log(`closing line present:  ${finalSpeech.trimEnd().endsWith(expected)}`);
  console.log(`\n--- final scene as spoken ---\n${finalSpeech}`);
}

// Ask the backend directly whether it considers the story complete. This is the
// is_completed flag the server ORs with "no choices left" — the MCP output
// alone cannot tell you which of the two fired.
try {
  const direct = new OuycClient({
    apiBase: (process.env.OUYC_API_BASE ?? "https://story-weaver-app-production.up.railway.app").replace(/\/+$/, ""),
    token: process.env.OUYC_TOKEN || undefined,
    refreshToken: process.env.OUYC_REFRESH_TOKEN || undefined,
    clientId: process.env.OUYC_CLIENT_ID || undefined,
  });
  const full = await direct.getAdventure(storyId);
  const segs = full.segments ?? [];
  const last: any = segs[segs.length - 1];
  console.log(`\nbackend is_completed: ${full.is_completed}`);
  console.log(`backend segments:     ${segs.length}`);
  console.log(`backend last choices: ${(last?.choices ?? []).length}`);
} catch (e) {
  console.log(`\nbackend check failed (not fatal): ${(e as Error).message}`);
}

await client.close();
