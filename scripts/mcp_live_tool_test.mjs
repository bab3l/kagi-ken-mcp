import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverUrl = process.env.SERVER_URL || "http://127.0.0.1:8000/mcp";
const mode = (process.env.LIVE_TEST_MODE || "auto").trim().toLowerCase();
const testQuery = process.env.LIVE_TEST_QUERY || "Kagi search";
const summaryUrl = process.env.LIVE_TEST_SUMMARY_URL || "https://www.kagi.com";
const requestTimeoutMs = Number(process.env.MCP_REQUEST_TIMEOUT_MS || "180000");

const client = new Client(
  {
    name: "kagi-ken-mcp-live",
    version: "0.1.0",
  },
  {
    capabilities: {},
  },
);

const transport = new StreamableHTTPClientTransport(new URL(serverUrl));

if (!["auto", "search", "summarizer"].includes(mode)) {
  throw new Error("LIVE_TEST_MODE must be one of: auto, search, summarizer");
}

function extractText(result) {
  return (result.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n")
    .trim();
}

async function runSearch(client) {
  const result = await client.callTool(
    {
      name: "kagi_search_fetch",
      arguments: { queries: [testQuery], limit: 3 },
    },
    undefined,
    { timeout: requestTimeoutMs },
  );

  return {
    result,
    text: extractText(result),
  };
}

async function runSummarizer(client) {
  const result = await client.callTool(
    {
      name: "kagi_summarizer",
      arguments: { url: summaryUrl, summary_type: "summary" },
    },
    undefined,
    { timeout: requestTimeoutMs },
  );

  return {
    result,
    text: extractText(result),
  };
}

try {
  await client.connect(transport);
  const toolsResult = await client.listTools(undefined, { timeout: requestTimeoutMs });
  const names = toolsResult.tools.map((tool) => tool.name);

  if (mode === "search" || mode === "auto") {
    if (!names.includes("kagi_search_fetch")) {
      if (mode === "search") {
        throw new Error("kagi_search_fetch not available");
      }
    } else {
      console.log(`Calling kagi_search_fetch on ${serverUrl}`);
      const { result, text } = await runSearch(client);

      if (!result.isError && text) {
        console.log("Live search test output preview:");
        console.log(text.slice(0, 500));
        console.log("Live API test passed.");
        process.exit(0);
      }

      if (mode === "search") {
        throw new Error(`Live search tool call failed: ${text || "No text output"}`);
      }

      const unauthorized = /401|unauthorized/i.test(text);
      if (!unauthorized) {
        throw new Error(`Search failed for non-auth reason in auto mode: ${text || "No text output"}`);
      }

      console.log("Search unauthorized in auto mode; falling back to summarizer.");
    }
  }

  if (!names.includes("kagi_summarizer")) {
    throw new Error("kagi_summarizer not available");
  }

  console.log(`Calling kagi_summarizer on ${serverUrl}`);
  const { result, text } = await runSummarizer(client);

  if (result.isError || !text) {
    throw new Error("Tool call returned no text output");
  }

  const snippet = text.slice(0, 500);
  console.log("Live test output preview:");
  console.log(snippet);
  console.log("Live API test passed.");
} finally {
  await transport.close();
}
