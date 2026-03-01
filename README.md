# kagi-ken-mcp-network

Network-enabled Docker packaging for [`czottmann/kagi-ken-mcp`](https://github.com/czottmann/kagi-ken-mcp) using `supergateway`. This is provided until the kagimcp container can conduct searches via the API (the feature is currently in beta and invite only).

This container allows Kagi search to be added to network-based AI (like Home Assistant's Voice assistants).

## Quickstart (GHCR)

Your Kagi session token can be found in the session link from your user page. https://kagi.com/settings/user_details

Tokens are rotated after 90 days of inactivity, so may need to be refreshed.

```bash
docker run --rm -it \
  -e KAGI_SESSION_TOKEN=your_session_token \
  -e MCP_TRANSPORT=streamableHttp \
  -e MCP_PORT=8000 \
  -p 8000:8000 \
  ghcr.io/<your-gh-user>/kagi-ken-mcp:latest
```

MCP endpoint (streamable HTTP): `http://localhost:8000/mcp`

## Local development

1. Copy `.env.example` to `.env` and set `KAGI_SESSION_TOKEN`.
2. Build and run:

```bash
docker compose up --build
```

3. Check health:

```bash
docker compose ps
```

## Environment variables

- `KAGI_SESSION_TOKEN` (required): Kagi session token used by upstream tools.
- `KAGI_SUMMARIZER_ENGINE` (optional): `default`, `agnes`, `muriel`, `cecil`.
- `MCP_TRANSPORT`: `streamableHttp` (default) or `sse`.
- `MCP_PORT`: listen port (default `8000`).
- `MCP_STREAMABLE_HTTP_PATH`: streamable HTTP path (default `/mcp`).
- `MCP_SSE_PATH`: SSE path when using SSE transport (default `/sse`).
- `MCP_MESSAGE_PATH`: message POST path for SSE transport (default `/message`).

## CI/CD and automation

- `CI`: Docker build + container health + MCP smoke test (`tools/list`).
- `Docker Publish`: publishes to GHCR and tracks upstream tag updates in `.upstream-version`.
- `Security Scan`: Trivy filesystem and image scans with SARIF upload.
- `Live API Test`: manual/scheduled real tool call with `KAGI_SESSION_TOKEN` secret.
- `Dependabot`: updates GitHub Actions, Docker, and npm dependencies.

## License

This repository contains glue code and configuration. Upstream project license details are documented in `THIRD_PARTY_NOTICES.md`.
