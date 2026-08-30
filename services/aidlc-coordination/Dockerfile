FROM node:24-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
RUN mkdir -p /data
ENV MCP_STATE_HOST=0.0.0.0 MCP_STATE_PORT=8787 MCP_STATE_SQLITE_PATH=/data/mcp-state.db
EXPOSE 8787
CMD ["node", "src/server.mjs"]
