FROM node:25-slim

ARG KAGI_KEN_MCP_REF=1.3.0
ENV KAGI_KEN_MCP_REF=${KAGI_KEN_MCP_REF}

ENV MCP_TRANSPORT=streamableHttp \
    MCP_PORT=8000 \
    MCP_STREAMABLE_HTTP_PATH=/mcp \
    MCP_SSE_PATH=/sse \
    MCP_MESSAGE_PATH=/message \
    MCP_LOG_LEVEL=info

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
  && git config --global url."https://github.com/".insteadOf "git@github.com:" \
  && git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/"

RUN npm install -g \
  supergateway \
  https://github.com/czottmann/kagi-ken-mcp/archive/refs/tags/${KAGI_KEN_MCP_REF}.tar.gz

COPY docker/run_gateway.sh /app/run_gateway.sh
COPY docker/healthcheck.mjs /app/healthcheck.mjs
RUN chmod +x /app/run_gateway.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node /app/healthcheck.mjs

ENTRYPOINT ["/app/run_gateway.sh"]
