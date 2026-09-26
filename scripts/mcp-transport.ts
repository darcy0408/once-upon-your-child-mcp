/**
 * Client transport for the check scripts. Sends the shared secret when the
 * server requires one (MCP_SHARED_SECRET in .env), so the scripts keep
 * working against a locked-down deployment.
 */
import "dotenv/config";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function mcpUrl(): URL {
  return new URL(process.env.MCP_URL ?? `http://127.0.0.1:${process.env.PORT ?? 3333}/mcp`);
}

export function mcpTransport(url: URL = mcpUrl()): StreamableHTTPClientTransport {
  const secret = process.env.MCP_SHARED_SECRET;
  return new StreamableHTTPClientTransport(
    url,
    secret ? { requestInit: { headers: { Authorization: `Bearer ${secret}` } } } : undefined,
  );
}
