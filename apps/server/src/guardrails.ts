import {
  DIRECTIVE_TYPES,
  type DirectiveInterpretation,
  type DirectiveType,
  type OptimizeRequest,
  type StructuredAdjustment,
} from "./schema";

export class GuardrailError extends Error {}

/**
 * Deterministically validates and normalizes raw LLM output.
 * The LLM is untrusted: this layer enforces the exact directive contract
 * (types, note mapping, hours, numeric ranges, applies semantics) before
 * anything reaches the optimizer. Throws GuardrailError on hard failures
 * so the caller can retry / fail safely. Never invents directives.
 */
export function validateInterpretations(
  raw: unknown,
  input: OptimizeRequest,
): DirectiveInterpretation[] {
  const noteCount = input.operator_notes.length;
  const capacity = input.battery.capacity_kwh;

  const entries = extractEntries(raw);
  if (entries.length !== noteCount) {
    throw new GuardrailError(`expected ${noteCount} interpretation entries, got ${entries.length}`);
  }

  const result: DirectiveInterpretation[] = [];
  const usedIndexes = new Set<number>();

  for (let i = 0; i < entries.length; i++) {
    const entry = asRecord(entries[i], `entry ${i}`);
    let noteIndex = readInt(entry.note_index, `entry ${i}.note_index`);

    // Tolerate a missing/misaligned note_index only when order is intact.
    if (noteIndex < 0 || noteIndex >= noteCount) {
      if (usedIndexes.has(i) || noteIndex !== i) {
        noteIndex = i;
      }
    }
    if (usedIndexes.has(noteIndex)) {
      throw new GuardrailError(`duplicate note_index ${noteIndex}`);
    }
    usedIndexes.add(noteIndex);

    const directiveType = readDirectiveType(entry.directive_type, noteIndex);
    const explanation =
      typeof entry.explanation === "string" && entry.explanation.trim().length > 0
        ? entry.explanation.trim()
        : defaultExplanation(directiveType);

    if (directiveType === "no_op") {
      result.push({
        note_index: noteIndex,
        applies: false,
        directive_type: "no_op",
        structured_adjustment: null,
        explanation,
      });
      continue;
    }

    const adj = validateAdjustment(directiveType, entry.structured_adjustment, capacity, noteIndex);
    result.push({
      note_index: noteIndex,
      applies: true,
      directive_type: directiveType,
      structured_adjustment: adj,
      explanation,
    });
  }

  result.sort((a, b) => a.note_index - b.note_index);
  return result;
}

function extractEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const key of ["interpretations", "directive_interpretation", "entries", "directives"]) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  throw new GuardrailError("LLM output is not an array of interpretations");
}

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    throw new GuardrailError(`${where} is not an object`);
  }
  return v as Record<string, unknown>;
}

function readInt(v: unknown, where: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n)) {
    throw new GuardrailError(`${where} is not an integer`);
  }
  return n;
}

function readDirectiveType(v: unknown, noteIndex: number): DirectiveType {
  if (typeof v === "string" && (DIRECTIVE_TYPES as readonly string[]).includes(v)) {
    return v as DirectiveType;
  }
  throw new GuardrailError(`note ${noteIndex}: unsupported directive_type "${String(v)}"`);
}

function readHours(v: unknown, noteIndex: number): number[] {
  if (!Array.isArray(v)) {
    throw new GuardrailError(`note ${noteIndex}: hours is not an array`);
  }
  const hours: number[] = [];
  for (const item of v) {
    const n = typeof item === "string" ? Number(item) : item;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 23) {
      throw new GuardrailError(`note ${noteIndex}: invalid hour ${String(item)}`);
    }
    if (!hours.includes(n)) hours.push(n);
  }
  hours.sort((a, b) => a - b);
  if (hours.length === 0) {
    throw new GuardrailError(`note ${noteIndex}: hours array is empty`);
  }
  return hours;
}

function readNumber(v: unknown, where: string): number {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new GuardrailError(`${where} is not a finite number`);
  }
  return n;
}

function validateAdjustment(
  type: Exclude<DirectiveType, "no_op">,
  raw: unknown,
  capacity: number,
  noteIndex: number,
): StructuredAdjustment {
  const adj = asRecord(raw, `note ${noteIndex}.structured_adjustment`);
  const hours = readHours(adj.hours, noteIndex);

  switch (type) {
    case "solar_reduction": {
      const factor = readNumber(adj.factor, `note ${noteIndex}.factor`);
      if (factor < 0 || factor > 1) {
        throw new GuardrailError(`note ${noteIndex}: factor ${factor} out of [0,1]`);
      }
      return { hours, factor };
    }
    case "minimum_battery_reserve": {
      const minE = readNumber(adj.minimum_energy_kwh, `note ${noteIndex}.minimum_energy_kwh`);
      if (minE < 0 || minE > capacity) {
        throw new GuardrailError(
          `note ${noteIndex}: minimum_energy_kwh ${minE} out of [0, ${capacity}]`,
        );
      }
      return { hours, minimum_energy_kwh: minE };
    }
    case "max_grid_window": {
      const maxGrid = readNumber(adj.max_grid_kwh, `note ${noteIndex}.max_grid_kwh`);
      if (maxGrid < 0) {
        throw new GuardrailError(`note ${noteIndex}: max_grid_kwh ${maxGrid} < 0`);
      }
      return { hours, max_grid_kwh: maxGrid };
    }
    case "no_charge_window":
    case "no_discharge_window":
      return { hours };
  }
}

function defaultExplanation(type: DirectiveType): string {
  switch (type) {
    case "solar_reduction":
      return "Solar availability is reduced during the listed hours.";
    case "minimum_battery_reserve":
      return "Battery energy must stay at or above the reserve level.";
    case "no_charge_window":
      return "Battery charging is unavailable during the listed hours.";
    case "no_discharge_window":
      return "Battery discharging is unavailable during the listed hours.";
    case "max_grid_window":
      return "Grid import is capped during the listed hours.";
    case "no_op":
      return "This note does not affect today's energy schedule.";
  }
}
