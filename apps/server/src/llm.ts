import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createGateway, generateText, type LanguageModel } from "ai";

import { GuardrailError, validateInterpretations } from "./guardrails";
import type { DirectiveInterpretation, OptimizeRequest } from "./schema";

// Chains are raced small on purpose: the FIRST model of Gateway and Gemini
// fire at t=0, and each chain's next model hedges FALLBACK_DELAY_MS behind.
// Typical request costs 2 calls; the full chain costs 6. Racing everything
// would burn free-tier quotas 12x per scenario for no latency gain.
export const DEFAULT_GATEWAY_MODELS = [
  "inclusionai/ling-3.0-flash-fin",
  "inclusionai/ling-3.0-flash-sante",
];
export const DEFAULT_OPENROUTER_MODELS = [
  "inclusionai/ling-3.0-flash-sante:free",
  "openrouter/free",
];
export const DEFAULT_GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash"];

const ATTEMPT_TIMEOUT_MS = 20_000;
// Hard ceiling for the whole race: the judge caps requests at 30 s, so a
// total provider outage must end in a controlled 500 before that, not in a
// judge-side timeout.
const OVERALL_DEADLINE_MS = 25_000;
// Provider tier N starts N * FALLBACK_DELAY_MS after the first tier: the
// highest-priority configured provider wins when healthy, later tiers act
// as near-instant fallbacks. Tier order: AI Gateway, Gemini, OpenRouter.
const FALLBACK_DELAY_MS = 2_500;
const FEEDBACK_ROUNDS = 2;

// In-isolate cache: identical note sets never hit the network twice.
const interpretationCache = new Map<string, DirectiveInterpretation[]>();

function cacheKey(notes: string[]): string {
  const text = notes.join("");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ text.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${text.length}`;
}

class JsonExtractError extends Error {}

/**
 * Extracts the first JSON value from raw model text: tolerates markdown
 * fences, leading prose, and trailing commentary. Returns the parsed value.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to tolerant extraction
  }
  const unfenced = trimmed.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    // fall through to bracket scan
  }
  const start = unfenced.search(/[{[]/);
  if (start === -1) throw new JsonExtractError("no JSON found in model output");
  const open = unfenced[start];
  const close = open === "{" ? "}" : "]";
  const end = unfenced.lastIndexOf(close);
  if (end <= start) throw new JsonExtractError("unbalanced JSON in model output");
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch (err) {
    throw new JsonExtractError(
      `JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const SYSTEM_PROMPT = `You convert campus-energy operator notes into strict, machine-checkable directives for a 24-hour energy scheduling optimizer (hours are integers 0-23, hour 0 = midnight).

OUTPUT CONTRACT: respond with ONLY one JSON object of the form {"interpretations": [...]} — no markdown fences, no commentary, no extra keys. Exactly ONE interpretation per note, in the same order as the notes, with note_index 0..N-1.

Supported directive_type values and their REQUIRED structured_adjustment shapes:
- "solar_reduction": usable solar is temporarily reduced. {"hours":[...], "factor": <number 0-1>}. factor is the USABLE FRACTION REMAINING: "drop to 20%" => factor 0.2, "80% reduction" => factor 0.2, "about half" => factor 0.5.
- "minimum_battery_reserve": battery energy must stay at or above a level. {"hours":[...], "minimum_energy_kwh": <kWh>}. If the note gives a PERCENTAGE of battery capacity, convert it: kWh = percent * capacity. The capacity is given below.
- "no_charge_window": battery charging unavailable. {"hours":[...]}
- "no_discharge_window": battery discharging unavailable. {"hours":[...]}
- "max_grid_window": grid import capped per hour. {"hours":[...], "max_grid_kwh": <kWh>}
- "no_op": the note does not affect today's 24-hour energy schedule (administrative news, future events beyond today, unrelated topics). applies=false, structured_adjustment=null.

Hard rules:
- Time windows are whole-hour, START-INCLUSIVE and END-EXCLUSIVE. Convert EVERY window with this exact procedure: start = first clock time as a 24-hour integer, end = second clock time as a 24-hour integer, then hours = [start, start+1, ..., end-1]. The end hour itself is NEVER included. If the window ends at midnight, end = 24 (so the last included hour is 23).
  Worked examples: "1 PM to 3 PM" => start 13, end 15 => [13,14]. "from noon until 2 PM" => start 12, end 14 => [12,13]. "between 14:00 and 16:00" => [14,15]. "from 6 PM until 9 PM" => start 18, end 21 => [18,19,20]. "from 6 PM until 10 PM" => start 18, end 22 => [18,19,20,21]. "from 7 PM until 10 PM" => [19,20,21]. "from 2 AM until 5 AM" => [2,3,4]. "from 10 PM until midnight" => [22,23]. "from midnight until 3 AM" => [0,1,2]. If a window CROSSES midnight (the end time is earlier than the start), the hours wrap around: "from 10 PM until 2 AM" => [22,23,0,1].
- "hours" must contain unique integers 0-23 in ascending order.
- For every non-no_op directive: applies=true. For no_op: applies=false and structured_adjustment=null.
- NEVER invent demand, solar, tariff, or battery numbers that are not stated or implied by the note. NEVER emit a directive type not listed above.
- If a note mentions energy equipment but is purely informational with no actionable schedule constraint, use no_op.
- "explanation": one short sentence.

Examples of the exact output entries:
note: "Facilities will wash the rooftop solar panels from noon until 2 PM. During cleaning, usable solar should be treated as roughly 25% of the forecast."
=> {"note_index":0,"applies":true,"directive_type":"solar_reduction","structured_adjustment":{"hours":[12,13],"factor":0.25},"explanation":"Panel washing reduces usable solar to 25% from 12:00 to 14:00."}

note: "The battery charger will be isolated from 2 AM until 5 AM for electrical maintenance."
=> {"note_index":0,"applies":true,"directive_type":"no_charge_window","structured_adjustment":{"hours":[2,3,4]},"explanation":"Charging unavailable from 02:00 to 05:00."}

note: "Keep at least 50% of the battery capacity stored in the battery from 6 PM until 9 PM for emergency operations." (capacity 200 kWh)
=> {"note_index":0,"applies":true,"directive_type":"minimum_battery_reserve","structured_adjustment":{"hours":[18,19,20],"minimum_energy_kwh":100},"explanation":"Reserve of 100 kWh (50% of 200 kWh) from 18:00 to 21:00."}

note: "From 6 PM until 9 PM, campus grid import must not exceed 155 kWh in any hour."
=> {"note_index":0,"applies":true,"directive_type":"max_grid_window","structured_adjustment":{"hours":[18,19,20],"max_grid_kwh":155},"explanation":"Grid import capped at 155 kWh from 18:00 to 21:00."}

note: "The sports office moved next month's registration deadline."
=> {"note_index":0,"applies":false,"directive_type":"no_op","structured_adjustment":null,"explanation":"Administrative note with no effect on today's energy schedule."}`;

export type LlmConfig = {
  gatewayApiKey?: string;
  gatewayModels: string[];
  geminiApiKey?: string;
  geminiModels: string[];
  openrouterApiKey?: string;
  openrouterModels: string[];
};

type ProviderAttempt = {
  label: string;
  delayMs: number;
  start: () => Promise<DirectiveInterpretation[]>;
};

// Extraction does not need chain-of-thought; disabling it cuts latency.
type GenProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;
const NO_THINKING: GenProviderOptions = {
  google: { thinkingConfig: { thinkingBudget: 0 } },
};

/**
 * Interprets all operator notes with a small hedged race: the first model of
 * Gateway and Gemini fire at t=0, each chain's next model follows 2.5 s
 * behind, OpenRouter forms the last tier. The first response that passes
 * deterministic guardrails wins. Guardrail failures re-prompt that model
 * once with the exact validation error. Throws when every provider fails
 * (caller maps to a controlled 500).
 */
export async function interpretNotes(
  input: OptimizeRequest,
  config: LlmConfig,
): Promise<DirectiveInterpretation[]> {
  // Capacity is part of the prompt (percentage-based reserves), so it must
  // be part of the cache key — identical notes under a different capacity
  // are a different interpretation.
  const key = cacheKey([`capacity:${input.battery.capacity_kwh}`, ...input.operator_notes]);
  const cached = interpretationCache.get(key);
  if (cached) return cached;

  const attempts: ProviderAttempt[] = [];

  // Stagger within each provider chain: model N starts N * FALLBACK_DELAY_MS
  // after the chain's first model. Gateway and Gemini race at t=0; OpenRouter
  // joins one hedge later as the last resort. Typical request = 2 calls.
  let providerBaseDelay = 0;

  if (config.gatewayApiKey) {
    const gateway = createGateway({ apiKey: config.gatewayApiKey });
    const base = providerBaseDelay;
    config.gatewayModels.forEach((modelId, i) => {
      const model = gateway(modelId);
      attempts.push({
        label: `gateway/${modelId}`,
        delayMs: base + i * FALLBACK_DELAY_MS,
        start: () => attemptModel(model, input),
      });
    });
    providerBaseDelay += FALLBACK_DELAY_MS;
  }

  if (config.geminiApiKey) {
    const google = createGoogleGenerativeAI({ apiKey: config.geminiApiKey });
    // Gemini races with the first tier, not behind it: cross-provider
    // diversity at t=0 beats waiting for a gateway-only failure.
    config.geminiModels.forEach((modelId, i) => {
      const model = google(modelId);
      // Lite models do not expose a thinking toggle; passing it errors.
      const options = modelId.includes("lite") ? undefined : NO_THINKING;
      attempts.push({
        label: `gemini/${modelId}`,
        delayMs: i * FALLBACK_DELAY_MS,
        start: () => attemptModel(model, input, options),
      });
    });
  }

  if (config.openrouterApiKey) {
    const openrouter = createOpenRouter({ apiKey: config.openrouterApiKey });
    const base = providerBaseDelay;
    config.openrouterModels.forEach((modelId, i) => {
      const model = openrouter(modelId);
      attempts.push({
        label: `openrouter/${modelId}`,
        delayMs: base + i * FALLBACK_DELAY_MS,
        start: () => attemptModel(model, input),
      });
    });
  }

  if (attempts.length === 0) {
    throw new Error("no LLM provider configured");
  }

  const races = attempts.map(({ delayMs, start }) =>
    (delayMs > 0 ? sleep(delayMs).then(start) : start()).then((result) => {
      interpretationCache.set(key, result);
      return result;
    }),
  );

  try {
    return await Promise.race([
      Promise.any(races),
      sleep(OVERALL_DEADLINE_MS).then(() => {
        throw new Error(
          `all LLM attempts exceeded the ${OVERALL_DEADLINE_MS / 1000} s overall deadline`,
        );
      }),
    ]);
  } catch (err) {
    const details =
      err instanceof AggregateError
        ? err.errors
            .map(
              (e, i) =>
                `${attempts[i]?.label ?? `provider ${i}`}: ${e instanceof Error ? e.message : String(e)}`,
            )
            .join(" | ")
        : err instanceof Error
          ? err.message
          : String(err);
    throw new Error(`all LLM attempts failed: ${details}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptModel(
  model: LanguageModel,
  input: OptimizeRequest,
  providerOptions?: GenProviderOptions,
): Promise<DirectiveInterpretation[]> {
  const userPrompt = buildUserPrompt(input);
  let feedback = "";
  let lastError: unknown = null;

  for (let round = 0; round < FEEDBACK_ROUNDS; round++) {
    try {
      const { text } = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: feedback ? `${userPrompt}\n\n${feedback}` : userPrompt,
        abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        maxRetries: 0,
        ...(providerOptions ? { providerOptions } : {}),
      });
      return validateInterpretations(extractJson(text), input);
    } catch (err) {
      lastError = err;
      if (err instanceof GuardrailError || err instanceof JsonExtractError) {
        const message = err.message;
        feedback = `VALIDATION FEEDBACK: your previous output was rejected: ${message}. Return ONLY the corrected JSON object.`;
        continue;
      }
      // Provider / network / timeout failure: give up on this model.
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function buildUserPrompt(input: OptimizeRequest): string {
  const notes = input.operator_notes.map((n, i) => `note_index ${i}: "${n}"`).join("\n");
  return `Battery capacity: ${input.battery.capacity_kwh} kWh.

Operator notes (${input.operator_notes.length} total):
${notes}

Return ONLY the JSON object with the "interpretations" array now.`;
}
