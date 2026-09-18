/**
 * Public sample-case harness for the GridWise preliminary.
 *
 * Boots the server (Node entry) if not already running, POSTs every case
 * from the public sample pack to /optimize-energy, then mirrors the judge:
 *   - interpretation vs expected ground truth (type, applies, hours, values)
 *   - plan replayed against OUR interpretation (application correctness)
 *   - plan replayed against the EXPECTED interpretation (judge ground truth)
 *   - totals recomputation + cost comparison vs reference optimal
 *
 * Usage:
 *   bun run scripts/test-samples.ts            (spawns server on :3100)
 *   BASE_URL=http://localhost:3000 bun run scripts/test-samples.ts --no-spawn
 */

import { buildEffectiveScenario } from "../src/optimizer";
import { requestSchema, type DirectiveInterpretation } from "../src/schema";
import { verifyPlan } from "../src/verifier";

const SAMPLE_PACK_URL = new URL(
  "../../../BUP_CSE_FEST_2026_Participant_Docs/BUP_CSE_FEST_2026_Preli_Public_Sample_Cases.json",
  import.meta.url,
);

const TOL = 0.01;
const noSpawn = process.argv.includes("--no-spawn");
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3100";

type ExpectedCase = {
  id: string;
  label: string;
  input: unknown;
  expected_output: {
    directive_interpretation: DirectiveInterpretation[];
    hourly_plan: unknown;
    total_cost_bdt: number;
  };
};

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function hoursOf(adj: unknown): number[] {
  if (adj && typeof adj === "object" && Array.isArray((adj as { hours?: unknown }).hours)) {
    return (adj as { hours: number[] }).hours;
  }
  return [];
}

function compareInterpretations(
  got: DirectiveInterpretation[],
  expected: DirectiveInterpretation[],
): string[] {
  const problems: string[] = [];
  if (got.length !== expected.length) {
    problems.push(`interpretation length ${got.length} != ${expected.length}`);
    return problems;
  }
  for (let i = 0; i < expected.length; i++) {
    const g = got[i];
    const e = expected[i];
    if (!g || !e) {
      problems.push(`entry ${i}: missing interpretation entry`);
      continue;
    }
    if (g.note_index !== e.note_index) {
      problems.push(`entry ${i}: note_index ${g.note_index} != ${e.note_index}`);
    }
    if (g.applies !== e.applies) {
      problems.push(`note ${i}: applies ${g.applies} != ${e.applies}`);
    }
    if (g.directive_type !== e.directive_type) {
      problems.push(`note ${i}: type ${g.directive_type} != ${e.directive_type}`);
      continue;
    }
    const gh = hoursOf(g.structured_adjustment).join(",");
    const eh = hoursOf(e.structured_adjustment).join(",");
    if (gh !== eh) problems.push(`note ${i}: hours [${gh}] != [${eh}]`);
    for (const key of ["factor", "minimum_energy_kwh", "max_grid_kwh"] as const) {
      const gv = (g.structured_adjustment as Record<string, number> | null)?.[key];
      const ev = (e.structured_adjustment as Record<string, number> | null)?.[key];
      if (gv === undefined && ev === undefined) continue;
      if (gv === undefined || ev === undefined || Math.abs(gv - ev) > TOL) {
        problems.push(`note ${i}: ${key} ${gv} != ${ev}`);
      }
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const file = Bun.file(SAMPLE_PACK_URL);
  const pack = (await file.json()) as { cases: ExpectedCase[] };

  let child: ReturnType<typeof Bun.spawn> | null = null;
  if (!noSpawn) {
    child = Bun.spawn(["bun", "run", "--env-file=.env", "src/node-entry.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, PORT: "3100" },
      stdout: "inherit",
      stderr: "inherit",
    });
  }

  try {
    const healthy = await waitForHealth(BASE_URL, 30_000);
    if (!healthy) {
      console.error(`server did not become healthy at ${BASE_URL}`);
      process.exitCode = 1;
      return;
    }

    let pass = 0;
    let fail = 0;

    for (const testCase of pack.cases) {
      const problems: string[] = [];
      const t0 = performance.now();
      let response: Response;
      try {
        response = await fetch(`${BASE_URL}/optimize-energy`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(testCase.input),
        });
      } catch (err) {
        console.log(`FAIL ${testCase.id} (${testCase.label}): request error ${String(err)}`);
        fail++;
        continue;
      }
      const latency = Math.round(performance.now() - t0);

      if (response.status !== 200) {
        const body = await response.text();
        console.log(`FAIL ${testCase.id}: HTTP ${response.status} ${body.slice(0, 200)}`);
        fail++;
        continue;
      }

      const body = (await response.json()) as Record<string, unknown>;
      const parsedInput = requestSchema.parse(testCase.input);

      // Schema basics
      if (body.scenario_id !== parsedInput.scenario_id) {
        problems.push("scenario_id mismatch");
      }
      const plan = body.hourly_plan as Parameters<typeof verifyPlan>[2];
      if (!Array.isArray(plan) || plan.length !== 24) {
        problems.push("hourly_plan is not 24 entries");
      }
      const interpretation = body.directive_interpretation as DirectiveInterpretation[];
      if (!Array.isArray(interpretation)) {
        problems.push("directive_interpretation missing");
        console.log(`FAIL ${testCase.id} (${testCase.label}) [${latency}ms]`);
        for (const p of problems) console.log(`     - ${p}`);
        fail++;
        continue;
      }

      // 1. Interpretation vs ground truth
      problems.push(
        ...compareInterpretations(
          interpretation,
          testCase.expected_output.directive_interpretation,
        ),
      );

      // 2. Plan valid under OUR interpretation
      const effOurs = buildEffectiveScenario(parsedInput, interpretation);
      const checkOurs = verifyPlan(parsedInput, effOurs, plan, TOL);
      if (!checkOurs.ok) {
        for (const e of checkOurs.errors) problems.push(`plan-vs-ours: ${e}`);
      }

      // 3. Plan valid under EXPECTED (judge) interpretation
      const effExpected = buildEffectiveScenario(
        parsedInput,
        testCase.expected_output.directive_interpretation,
      );
      const checkExpected = verifyPlan(parsedInput, effExpected, plan, TOL);
      if (!checkExpected.ok) {
        for (const e of checkExpected.errors) problems.push(`plan-vs-truth: ${e}`);
      }

      // 4. Totals recomputed
      if (
        typeof body.total_cost_bdt !== "number" ||
        Math.abs(body.total_cost_bdt - checkOurs.totalCost) > TOL
      ) {
        problems.push(`total_cost_bdt ${body.total_cost_bdt} != recomputed ${checkOurs.totalCost}`);
      }

      // 5. Cost quality vs reference optimal
      const expectedCost = testCase.expected_output.total_cost_bdt;
      const ratio = expectedCost > TOL ? checkOurs.totalCost / expectedCost : 1;
      const costNote = `cost ${checkOurs.totalCost.toFixed(2)} vs ref ${expectedCost.toFixed(2)} (ratio ${ratio.toFixed(4)})`;
      if (ratio > 1 + 0.005) {
        problems.push(`cost above reference: ${costNote}`);
      }

      if (problems.length === 0) {
        console.log(`PASS ${testCase.id} (${testCase.label}) [${latency}ms] ${costNote}`);
        pass++;
      } else {
        console.log(`FAIL ${testCase.id} (${testCase.label}) [${latency}ms] ${costNote}`);
        for (const p of problems) console.log(`     - ${p}`);
        fail++;
      }
    }

    console.log(`\n${pass} passed, ${fail} failed out of ${pack.cases.length}`);
    if (fail > 0) process.exitCode = 1;
  } finally {
    child?.kill();
  }
}

await main();
