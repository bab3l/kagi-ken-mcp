import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverUrl = process.env.SERVER_URL || "http://127.0.0.1:8000/mcp";
const requestTimeoutMs = Number(process.env.MCP_REQUEST_TIMEOUT_MS || "180000");
const expectedTools = new Set(["kagi_search_fetch", "kagi_summarizer"]);

const client = new Client(
  {
    name: "kagi-ken-mcp-smoke",
    version: "0.1.0",
  },
  {
    capabilities: {},
  },
);

const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

try {
  await client.connect(transport);
  const toolsResult = await client.listTools(undefined, { timeout: requestTimeoutMs });
  const names = toolsResult.tools.map((tool) => tool.name);

  console.log("Discovered tools:", names.join(", "));

  const missing = [...expectedTools].filter((tool) => !names.includes(tool));
  if (missing.length > 0) {
    throw new Error(`Missing expected tools: ${missing.join(", ")}`);
  }

  console.log("Smoke test passed.");
} finally {
  await transport.close();
}
