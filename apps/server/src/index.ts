import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { ConfigError, getConfig } from "./config";
import { interpretNotes } from "./llm";
import { buildEffectiveScenario, solveScenario } from "./optimizer";
import { requestSchemaBase, validateRequestSemantics } from "./schema";
import { verifyPlan } from "./verifier";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/optimize-energy", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "malformed_json", message: "Request body is not valid JSON." }, 400);
  }

  const parsed = requestSchemaBase.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid_request",
        message: parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  }

  const input = parsed.data;

  // 422 (optional per spec): well-formed but semantically invalid.
  const semanticErrors = validateRequestSemantics(input);
  if (semanticErrors.length > 0) {
    return c.json(
      { error: "semantically_invalid", message: semanticErrors.slice(0, 5).join("; ") },
      422,
    );
  }

  try {
    const config = getConfig(c);

    // 1. LLM interpretation (validated by deterministic guardrails).
    const interpretations = await interpretNotes(input, config);

    // 2. Fold directives into effective constraints and solve the LP.
    const effective = buildEffectiveScenario(input, interpretations);
    const plan = solveScenario(effective);
    if (!plan) {
      console.error("LP infeasible for scenario", input.scenario_id);
      return c.json(
        { error: "optimization_failed", message: "No feasible schedule found for this scenario." },
        500,
      );
    }

    // 3. Deterministic self-verification (judge mirror) before responding.
    const check = verifyPlan(input, effective, plan);
    if (!check.ok) {
      console.error("self-verification failed", check.errors.join(" | "));
      return c.json(
        { error: "internal_validation_failed", message: "Schedule failed internal validation." },
        500,
      );
    }

    const appliedCount = interpretations.filter((d) => d.applies).length;
    return c.json({
      scenario_id: input.scenario_id,
      directive_interpretation: interpretations,
      hourly_plan: plan,
      total_grid_kwh: round2(check.totalGrid),
      total_cost_bdt: round2(check.totalCost),
      peak_grid_kwh: round2(check.peakGrid),
      plan_summary: buildSummary(input, appliedCount, check.totalCost, check.peakGrid),
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error("configuration error");
      return c.json({ error: "configuration_error", message: "Service is not configured." }, 500);
    }
    console.error("optimize-energy failed:", err instanceof Error ? err.message : "unknown error");
    return c.json({ error: "internal_error", message: "An internal error occurred." }, 500);
  }
});

app.notFound((c) => c.json({ error: "not_found", message: "Unknown route." }, 404));

app.onError((err, c) => {
  console.error("unhandled error:", err.message);
  return c.json({ error: "internal_error", message: "An internal error occurred." }, 500);
});

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function buildSummary(
  input: { operator_notes: string[] },
  appliedCount: number,
  totalCost: number,
  peakGrid: number,
): string {
  const notePart =
    appliedCount === 0
      ? "no operator directives applied"
      : `${appliedCount} of ${input.operator_notes.length} operator note(s) applied`;
  return (
    `24-hour schedule with ${notePart}: solar is used first, the battery shifts energy ` +
    `from low-tariff to high-tariff hours while respecting all constraints, and remaining ` +
    `demand is met from the grid. Total grid cost ${round2(totalCost)} BDT, peak grid import ${round2(peakGrid)} kWh.`
  );
}

export default app;
