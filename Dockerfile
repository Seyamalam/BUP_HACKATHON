# GridWise LLM — fallback execution image.
# Builds a single-file bundle of the API server and runs it on Node/Bun.
# No secrets are baked in: API keys are supplied at runtime.

# Build runs on the native platform: every dependency is pure JS and the
# output is a platform-independent bundle, and emulated bun install segfaults.
FROM --platform=$BUILDPLATFORM oven/bun:1.4 AS build
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

# Required at runtime (at least one):
#   AI_GATEWAY_API_KEY           — Vercel AI Gateway key, primary provider (secret)
#   GOOGLE_GENERATIVE_AI_API_KEY — Gemini API key, first fallback (secret)
#   OPENROUTER_API_KEY           — OpenRouter API key, last fallback (secret)
# Optional:
#   AI_GATEWAY_MODELS / GEMINI_MODELS / OPENROUTER_MODELS — model chain overrides
#   PORT                — listen port (default 3000)
CMD ["bun", "server.js"]
