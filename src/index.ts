/**
 * Streamable HTTP entry point (MCP spec 2025-11-25).
 *
 * Stateless: each POST /mcp gets a fresh transport + server instance, which
 * is the recommended pattern for hosted MCP servers behind a load balancer.
 */
import "dotenv/config";
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
});
