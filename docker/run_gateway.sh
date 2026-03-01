#!/usr/bin/env bash
set -euo pipefail

transport="${MCP_TRANSPORT:-streamableHttp}"
port="${MCP_PORT:-8000}"
log_level="${MCP_LOG_LEVEL:-info}"
ref="${KAGI_KEN_MCP_REF:-1.3.0}"
ha_compat="${MCP_HA_COMPAT:-false}"
ha_internal_port="${MCP_HA_INTERNAL_PORT:-$((port + 1))}"

if command -v kagi-ken-mcp >/dev/null 2>&1; then
  stdio_command="kagi-ken-mcp"
else
  stdio_command="npx -y github:czottmann/kagi-ken-mcp#${ref}"
fi

args=(
  --stdio "${stdio_command}"
  --port "${port}"
  --logLevel "${log_level}"
)

case "${transport}" in
  streamable-http|streamableHttp)
    path="${MCP_STREAMABLE_HTTP_PATH:-/mcp}"
    args+=(--outputTransport streamableHttp --streamableHttpPath "${path}")
    ;;
  sse)
    sse_path="${MCP_SSE_PATH:-/sse}"
    message_path="${MCP_MESSAGE_PATH:-/message}"
    args+=(--outputTransport sse --ssePath "${sse_path}" --messagePath "${message_path}")
    ;;
  *)
    echo "Unsupported MCP_TRANSPORT: ${transport}" >&2
    echo "Supported values: streamableHttp, sse" >&2
    exit 2
    ;;
esac

if [[ "${ha_compat}" =~ ^([Tt][Rr][Uu][Ee]|1|[Yy][Ee][Ss]|[Oo][Nn])$ ]] && [[ "${transport}" =~ ^(streamable-http|streamableHttp)$ ]]; then
  args[3]="${ha_internal_port}"
  supergateway "${args[@]}" &
  supergateway_pid="$!"

  cleanup() {
    kill "${supergateway_pid}" 2>/dev/null || true
  }

  trap cleanup EXIT INT TERM

  export MCP_HA_UPSTREAM_BASE_URL="${MCP_HA_UPSTREAM_BASE_URL:-http://127.0.0.1:${ha_internal_port}}"
  exec node /app/ha_compat_proxy.mjs
fi

exec supergateway "${args[@]}"
