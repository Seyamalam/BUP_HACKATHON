# GridWise LLM — fallback execution image.
# Builds a single-file bundle of the API server and runs it on Node/Bun.
# No secrets are baked in: OPENROUTER_API_KEY is supplied at runtime.

FROM oven/bun:1.4 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
COPY apps/server/package.json apps/server/
COPY packages/config/package.json packages/config/
COPY packages/api/package.json packages/api/
COPY packages/db/package.json packages/db/
COPY packages/infra/package.json packages/infra/

RUN bun install --frozen-lockfile --ignore-scripts

COPY apps/server apps/server
COPY packages/config packages/config

RUN bun build apps/server/src/node-entry.ts --target=node --outfile=dist/server.js

FROM oven/bun:1.4-slim
WORKDIR /app
COPY --from=build /app/dist/server.js ./server.js

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Required at runtime:
#   OPENROUTER_API_KEY  — OpenRouter API key (secret)
# Optional:
#   OPENROUTER_MODELS   — comma-separated model chain override
#   PORT                — listen port (default 3000)
CMD ["bun", "server.js"]
