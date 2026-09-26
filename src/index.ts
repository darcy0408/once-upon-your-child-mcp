/**
 * Streamable HTTP entry point (MCP spec 2025-11-25).
 *
 * Stateless: each POST /mcp gets a fresh transport + server instance, which
 * is the recommended pattern for hosted MCP servers behind a load balancer.
 */
import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import { OuycClient } from "./ouyc-client.js";
import { buildServer } from "./server.js";

const PORT = Number(process.env.PORT ?? 3333);
const HOST = process.env.HOST ?? "0.0.0.0";
const API_BASE = (process.env.OUYC_API_BASE ?? "https://story-weaver-app-production.up.railway.app").replace(
  /\/+$/,
  "",
);

// Shared secret for POST /mcp. Optional locally; required once the server is
// reachable from the internet, because every caller becomes the demo parent.
const SHARED_SECRET = process.env.MCP_SHARED_SECRET ?? "";
const PUBLIC = Boolean(process.env.RAILWAY_ENVIRONMENT) || process.env.NODE_ENV === "production";
if (PUBLIC && !SHARED_SECRET) {
  console.error("[mcp] refusing to start: MCP_SHARED_SECRET is not set on a public deployment");
  process.exit(1);
}

/** True when the request carries `Authorization: Bearer <MCP_SHARED_SECRET>` (or no secret is configured). */
function authorized(req: Request): boolean {
  if (!SHARED_SECRET) return true;
  const match = /^Bearer\s+(\S+)$/i.exec(req.header("authorization")?.trim() ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1]);
  const want = Buffer.from(SHARED_SECRET);
  return given.length === want.length && timingSafeEqual(given, want);
}

const client = new OuycClient({
  apiBase: API_BASE,
  token: process.env.OUYC_TOKEN || undefined,
  refreshToken: process.env.OUYC_REFRESH_TOKEN || undefined,
  clientId: process.env.OUYC_CLIENT_ID || undefined,
  defaultVoiceId: process.env.OUYC_DEFAULT_VOICE_ID || undefined,
  log: (m) => console.log(`[ouyc] ${m}`),
});

const app = createMcpExpressApp({ host: HOST });

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({ ok: true, name: "once-upon-your-child-mcp", apiBase: API_BASE });
});

app.post("/mcp", async (req: Request, res: Response) => {
  if (!authorized(req)) {
    res
      .status(401)
      .set("WWW-Authenticate", 'Bearer realm="mcp"')
      .json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized. Send Authorization: Bearer <MCP_SHARED_SECRET>." },
        id: null,
      });
    return;
  }
  const server = buildServer(client);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] request failed", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const reject = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server is stateless; POST /mcp only." },
    id: null,
  });
};
app.get("/mcp", reject);
app.delete("/mcp", reject);

app.listen(PORT, HOST, () => {
  console.log(`[mcp] once-upon-your-child listening on http://${HOST}:${PORT}/mcp`);
  console.log(`[mcp] backend: ${API_BASE}`);
  if (!SHARED_SECRET) console.warn("[mcp] MCP_SHARED_SECRET is not set; POST /mcp is open to anyone who can reach it");
});
