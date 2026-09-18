# GridWise LLM — Smart Campus Energy Optimization

BUP CSE Fest 2026 Hackathon · Online Preliminary Round

One HTTP API service that interprets natural-language operator notes with an LLM,
validates the interpretation deterministically, and returns a valid, cost-optimal
24-hour campus energy schedule (grid + solar + battery).

## Architecture

```
POST /optimize-energy
  ├─ 1. Zod request validation .................. 400 on malformed input, never a crash
  ├─ 2. LLM interpretation (OpenRouter) ......... one call for ALL notes, per model;
  │     the model chain is RACED in parallel, first guardrail-passing response wins,
  │     guardrail failures re-prompt the model with the exact validation error
  ├─ 3. Deterministic guardrails ................ directive type enum, 1:1 note mapping,
  │     hours unique/ascending/0-23, factor ∈ [0,1], reserve ≤ capacity, applies semantics
  ├─ 4. LP optimizer (javascript-lp-solver) ..... min Σ grid·tariff s.t. energy balance,
  │     effective solar, battery dynamics/bounds/rate limits, directive windows, grid caps,
  │     end-of-day battery neutrality (E_final = E_initial)
  ├─ 5. Replay verifier (judge mirror) .......... re-checks every rule before responding
  └─ 6. Response ................................ interpretation + 24h plan + recomputed totals
```

**Why this shape:** the LLM is treated as untrusted. It never touches the math directly —
it emits structured directives that deterministic code validates, applies, and verifies.
If the LLM misbehaves, the service retries, falls back across a model chain, or returns a
controlled error. It never invents directives and never crashes.

| Layer                                       | Technology                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| HTTP server                                 | Hono (Cloudflare Workers / Node via `@hono/node-server`)                                     |
| LLM                                         | OpenRouter via Vercel AI SDK (`generateObject`, structured JSON)                             |
| Models (free tier chain, raced in parallel) | `inclusionai/ling-3.0-flash-sante:free` ⚡ `openrouter/free` — first validated response wins |
| Guardrails                                  | Hand-written deterministic validators (zod + rule checks)                                    |
| Optimizer                                   | `javascript-lp-solver` — exact LP Simplex, ~120 vars, ~1-3 ms                                |
| Verification                                | Deterministic schedule replay mirroring the judge's checks                                   |
| Deployment                                  | Cloudflare Workers (`wrangler deploy`), Docker fallback image                                |

The LLM is strictly inside the operator-note interpretation path — its structured output
becomes the optimizer's constraints. The optimizer, guardrails, and verifier are pure
deterministic TypeScript (no LLM in the math path).

## API

- `GET /health` → `{"status":"ok"}`
- `POST /optimize-energy` — accepts the scenario JSON (`scenario_id`, `operator_notes` (1-3),
  `hours` (24 × demand/solar/tariff), `battery`) and returns `scenario_id`,
  `directive_interpretation`, `hourly_plan`, `total_grid_kwh`, `total_cost_bdt`,
  `peak_grid_kwh`, `plan_summary` per the Problem Statement.

Errors are controlled JSON: `400 malformed_json` (unparseable body) /
`400 invalid_request` (structurally invalid) / `422 semantically_invalid`
(well-formed but inconsistent, e.g. duplicate/missing hours) /
`500 internal_error` — no stack traces, no secrets.

## Environment variables

| Name                 | Required  | Description                                           |
| -------------------- | --------- | ----------------------------------------------------- |
| `OPENROUTER_API_KEY` | yes       | OpenRouter API key (secret — never committed)         |
| `OPENROUTER_MODELS`  | no        | Comma-separated model chain override (defaults above) |
| `PORT`               | no (Node) | Listen port for the Node/Docker entry (default 3000)  |

## Local quickstart (clean environment)

Prerequisites: [Bun](https://bun.sh) v1.4+.

```bash
git clone <repo-url> && cd BUP_HACKATHON
bun install

# Configure the key (file is git-ignored):
printf 'OPENROUTER_API_KEY=sk-or-...\n' > apps/server/.env

# Start the API (Node entry, http://localhost:3000):
bun run dev

# In another terminal:
curl http://localhost:3000/health
# => {"status":"ok"}
```

Run one public sample case against the local server:

```bash
cd apps/server
python3 -c "
import json, urllib.request
pack = json.load(open('../../BUP_CSE_FEST_2026_Participant_Docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json'))
req = urllib.request.Request('http://localhost:3000/optimize-energy',
  data=json.dumps(pack['cases'][0]['input']).encode(),
  headers={'content-type':'application/json'})
print(json.dumps(json.load(urllib.request.urlopen(req)), indent=2)[:800])
"
```

## Public sample test procedure (expected result)

```bash
cd apps/server
bun run test:samples
```

This boots the server on `:3100`, POSTs all 10 public cases, and mirrors the judge:
interpretation vs ground truth, plan replayed against both our and the expected
interpretations, totals recomputation, and cost ratio vs the reference optimum.
**Expected:** `10 passed, 0 failed`, cost ratio 1.0000 per case.

The optimizer alone (no LLM) reproduces the reference optimal cost on all 10 public
cases exactly (ratio 1.0000), in ~1-3 ms per scenario.

## Deployment (Cloudflare Workers)

```bash
cd apps/server
bunx wrangler login                              # one-time
bunx wrangler secret put OPENROUTER_API_KEY    # store the key as a secret
bun run deploy                                  # wrangler deploy
```

The worker name is `gridwise-llm`; wrangler prints the public
`https://gridwise-llm.<account>.workers.dev` URL. Free-tier model chain is configured
via `vars.OPENROUTER_MODELS` in `wrangler.jsonc` (override without redeploying with
`bunx wrangler secret put OPENROUTER_MODELS`).

## Docker fallback

Pullable registry reference (Docker Hub):

```
docker.io/touhidulalam41/gridwise-llm:1.0.0
digest: sha256:6b7df6c7457f8d98709d70a6b0d7d337cc89efc0c7bc6eb915def282ce3e585e
```

```bash
docker pull docker.io/touhidulalam41/gridwise-llm:1.0.0
docker run --rm -p 3000:3000 -e OPENROUTER_API_KEY=sk-or-... \
  docker.io/touhidulalam41/gridwise-llm:1.0.0
curl http://localhost:3000/health
# => {"status":"ok"}
```

Or build from source:

```bash
docker build -t gridwise-llm:latest .
docker run --rm -p 3000:3000 -e OPENROUTER_API_KEY=sk-or-... gridwise-llm:latest
```

The image builds a single-file bundle (`bun build`) and binds to `0.0.0.0:3000`.
No secrets are baked into the image; `OPENROUTER_API_KEY` is a runtime env var.

## Repository layout

```
apps/server/
  src/index.ts        Hono app: /health, /optimize-energy, controlled errors
  src/schema.ts       Zod request contract + shared types
  src/llm.ts          OpenRouter structured interpretation + model chain + cache
  src/guardrails.ts   Deterministic validation/normalization of LLM output
  src/optimizer.ts    Effective-scenario builder + LP formulation/solve
  src/verifier.ts     Judge-mirror replay verifier
  src/config.ts       Runtime env (Worker bindings / process.env)
  src/node-entry.ts   Node/Bun entry (Docker + local dev)
  scripts/test-samples.ts   Public sample harness
  wrangler.jsonc      Cloudflare Worker config
Dockerfile            Fallback image (multi-stage bun build)
```

## Dependencies (direct)

`hono`, `@hono/node-server`, `ai` (Vercel AI SDK), `@openrouter/ai-sdk-provider`,
`javascript-lp-solver`, `zod`; dev: `wrangler`, `typescript`, `@types/bun`.
Built with AI coding assistance. All libraries credited per their licenses.

## Known limitations

- Free-tier OpenRouter models have provider-side rate limits; the service retries and
  falls back across the configured chain, but an exhausted chain returns a controlled 500.
  Provide your own key / paid model via `OPENROUTER_MODELS` for production stability.
- The in-isolate interpretation cache is best-effort (per Worker isolate).
- Solar curtailment is free (per spec); grid export is not modeled (per spec).

## Security

No secrets in the repository, logs, or API responses. `.env` is git-ignored; the
Cloudflare key lives in `wrangler secret`; Docker receives keys at runtime only.
LLM output is validated deterministically before it can influence the schedule.
