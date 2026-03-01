const transport = process.env.MCP_TRANSPORT || "streamableHttp";
const port = process.env.MCP_PORT || "8000";

const path = transport === "sse"
  ? (process.env.MCP_SSE_PATH || "/sse")
  : (process.env.MCP_STREAMABLE_HTTP_PATH || "/mcp");

const url = `http://127.0.0.1:${port}${path}`;

try {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json, text/event-stream",
    },
  });

  process.exit(response.status < 500 ? 0 : 1);
} catch {
  process.exit(1);
}
