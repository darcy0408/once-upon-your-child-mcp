/**
 * Smoke test: connect over Streamable HTTP, list tools, and (only when
 * SMOKE_LIVE=1) call list_heroes against the real backend.
 *
 *   npm run dev            # in one terminal
 *   npm run smoke          # in another
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = new URL(process.env.MCP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3333}/mcp`);

const client = new Client({ name: "smoke", version: "0.0.1" });
const transport = new StreamableHTTPClientTransport(url);
await client.connect(transport);

const { tools } = await client.listTools();
console.log(`connected to ${url}`);
console.log(`protocol: ${transport.protocolVersion ?? "unknown"}`);
console.log("tools:");
for (const t of tools) console.log(`  - ${t.name}: ${t.description?.slice(0, 80)}`);

const { prompts } = await client.listPrompts();
console.log(`prompts: ${prompts.map((p) => p.name).join(", ")}`);

// list_voices hits the backend without auth, so it proves connectivity
// without creating an account. list_heroes needs a token (or will mint an
// anonymous account), so it is opt-in.
if (process.env.SMOKE_LIVE === "1") {
  const v = await client.callTool({ name: "list_voices", arguments: {} });
  console.log("list_voices ->", JSON.stringify(v.content, null, 2));
}
if (process.env.SMOKE_HEROES === "1") {
  const r = await client.callTool({ name: "list_heroes", arguments: {} });
  console.log("list_heroes ->", JSON.stringify(r.content, null, 2));
}

await client.close();
