/*
 * Home Assistant compatibility proxy.
 *
 * Why this exists:
 * Home Assistant's MCP integration rejected tool schemas containing some JSON Schema
 * keywords (notably `minItems`) during setup, even though upstream MCP servers expose
 * those fields. In that state, the integration fails before tools can be registered.
 *
 * Reproduced with:
 * - Home Assistant Core 2026.2.3 (HA OS 17.1 / Supervisor 2026.02.3)
 * - MCP protocol responses negotiated as 2025-11-25 via streamable HTTP
 *
 * This proxy is opt-in (MCP_HA_COMPAT=true) and strips known incompatible schema
 * keywords from JSON/JSON-like MCP responses before forwarding them to Home Assistant.
 */
import http from "node:http";
import { Readable } from "node:stream";

const listenPort = Number(process.env.MCP_PORT || "8000");
const upstreamPort = Number(process.env.MCP_HA_INTERNAL_PORT || String(listenPort + 1));
const upstreamBaseUrl = process.env.MCP_HA_UPSTREAM_BASE_URL || `http://127.0.0.1:${upstreamPort}`;
const stripKeywords = new Set(["minItems"]);

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${listenPort}`);
    const upstreamUrl = new URL(requestUrl.pathname + requestUrl.search, upstreamBaseUrl);

    const headers = { ...req.headers };
    delete headers.host;
    delete headers["content-length"];

    let bodyBuffer = await readRequestBody(req);
    const method = req.method || "GET";
    const shouldSendBody = method !== "GET" && method !== "HEAD";

    if (shouldSendBody && bodyBuffer.length > 0) {
      bodyBuffer = normalizeToolCallRequestBody(bodyBuffer, req.headers["content-type"]);
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers,
      body: shouldSendBody ? bodyBuffer : undefined,
      duplex: shouldSendBody ? "half" : undefined,
    });

    const responseHeaders = Object.fromEntries(upstreamResponse.headers.entries());
    delete responseHeaders["content-length"];
    delete responseHeaders["transfer-encoding"];

    const contentType = upstreamResponse.headers.get("content-type") || "";
    const lowerContentType = contentType.toLowerCase();
    const isJsonResponse = lowerContentType.includes("application/json");
    const isJsonLikeTextResponse =
      lowerContentType.includes("text/event-stream") || lowerContentType.includes("text/plain");

    if (!isJsonResponse && !isJsonLikeTextResponse) {
      res.writeHead(upstreamResponse.status, responseHeaders);
      if (upstreamResponse.body) {
        const stream = httpReadableFromWeb(upstreamResponse.body);
        stream.pipe(res);
      } else {
        res.end();
      }
      return;
    }

    const text = await upstreamResponse.text();

    if (!isJsonResponse) {
      const sanitizedText = stripKeywordFieldsFromJsonLikeText(text, stripKeywords);
      res.writeHead(upstreamResponse.status, {
        ...responseHeaders,
        "content-length": Buffer.byteLength(sanitizedText).toString(),
      });
      res.end(sanitizedText);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      res.writeHead(upstreamResponse.status, responseHeaders);
      res.end(text);
      return;
    }

    const sanitized = sanitizeSchemaObject(parsed, stripKeywords);

    const serialized = JSON.stringify(sanitized);
    res.writeHead(upstreamResponse.status, {
      ...responseHeaders,
      "content-type": "application/json",
      "content-length": Buffer.byteLength(serialized).toString(),
    });
    res.end(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: `HA compat proxy error: ${message}` }));
  }
});

server.listen(listenPort, () => {
  console.log(
    `[ha-compat-proxy] Listening on :${listenPort}, forwarding to ${upstreamBaseUrl}, stripping schema keywords: ${
      [...stripKeywords].join(",") || "(none)"
    }`,
  );
});

function sanitizeSchemaObject(value, keywords) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaObject(item, keywords));
  }

  if (value && typeof value === "object") {
    const sanitized = {};
    for (const [key, child] of Object.entries(value)) {
      if (keywords.has(key)) {
        continue;
      }
      sanitized[key] = sanitizeSchemaObject(child, keywords);
    }
    return sanitized;
  }

  return value;
}

function stripKeywordFieldsFromJsonLikeText(text, keywords) {
  let sanitized = text;
  for (const keyword of keywords) {
    const escapedKeyword = escapeRegex(keyword);
    const afterKeyPattern = new RegExp(`"${escapedKeyword}"\\s*:\\s*[^,}\\]]+\\s*,`, "g");
    const beforeKeyPattern = new RegExp(`,\\s*"${escapedKeyword}"\\s*:\\s*[^,}\\]]+`, "g");
    sanitized = sanitized.replace(afterKeyPattern, "");
    sanitized = sanitized.replace(beforeKeyPattern, "");
  }

  sanitized = sanitized.replace(/,\s*([}\]])/g, "$1");
  sanitized = sanitized.replace(/([\[{])\s*,/g, "$1");
  return sanitized;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function normalizeToolCallRequestBody(bodyBuffer, contentTypeHeader) {
  const contentType = String(contentTypeHeader || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return bodyBuffer;
  }

  const text = bodyBuffer.toString("utf8");
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return bodyBuffer;
  }

  const entries = Array.isArray(payload) ? payload : [payload];
  let changed = false;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    if (entry.method !== "tools/call") {
      continue;
    }

    const params = entry.params;
    if (!params || typeof params !== "object") {
      continue;
    }

    if (params.name !== "kagi_search_fetch") {
      continue;
    }

    const args = params.arguments;
    if (!args || typeof args !== "object") {
      continue;
    }

    const rawLimit = args.limit;
    if (typeof rawLimit !== "string") {
      continue;
    }

    if (!/^\d+$/.test(rawLimit.trim())) {
      continue;
    }

    args.limit = Number(rawLimit);
    changed = true;
  }

  return changed ? Buffer.from(JSON.stringify(payload)) : bodyBuffer;
}

function httpReadableFromWeb(webStream) {
  return webStream && typeof webStream.getReader === "function"
    ? Readable.fromWeb(webStream)
    : null;
}
