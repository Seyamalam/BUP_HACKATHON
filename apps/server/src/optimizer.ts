import solver from "javascript-lp-solver";

import type { DirectiveInterpretation, HourlyPlanEntry, OptimizeRequest } from "./schema";

export type EffectiveScenario = {
  demand: number[];
  tariff: number[];
  effSolar: number[];
  minEnergy: number[];
  chargeCap: number[];
  dischargeCap: number[];
  gridCap: (number | null)[];
  capacity: number;
  initial: number;
};

/**
 * Folds the base scenario and all applicable directives into per-hour
 * effective parameters used by both the optimizer and the verifier.
 */
export function buildEffectiveScenario(
  input: OptimizeRequest,
  directives: DirectiveInterpretation[],
): EffectiveScenario {
  const hours = [...input.hours].sort((a, b) => a.hour - b.hour);
  const demand = hours.map((h) => h.demand_kwh);
  const tariff = hours.map((h) => h.tariff_bdt_per_kwh);
  const effSolar = hours.map((h) => h.solar_kwh);
  const b = input.battery;
  const minEnergy = Array.from({ length: 24 }, () => b.minimum_energy_kwh);
  const chargeCap = Array.from({ length: 24 }, () => b.max_charge_kwh_per_hour);
  const dischargeCap = Array.from({ length: 24 }, () => b.max_discharge_kwh_per_hour);
  const gridCap: (number | null)[] = Array.from({ length: 24 }, () => null);

  for (const d of directives) {
    if (!d.applies || d.directive_type === "no_op" || !d.structured_adjustment) continue;
    const adj = d.structured_adjustment;
    switch (d.directive_type) {
      case "solar_reduction":
        if ("factor" in adj) {
          for (const h of adj.hours) effSolar[h] = at(effSolar, h) * adj.factor;
        }
        break;
      case "minimum_battery_reserve":
        if ("minimum_energy_kwh" in adj) {
          for (const h of adj.hours) {
            minEnergy[h] = Math.max(at(minEnergy, h), adj.minimum_energy_kwh);
          }
        }
        break;
      case "no_charge_window":
        for (const h of adj.hours) chargeCap[h] = 0;
        break;
      case "no_discharge_window":
        for (const h of adj.hours) dischargeCap[h] = 0;
        break;
      case "max_grid_window":
        if ("max_grid_kwh" in adj) {
          for (const h of adj.hours) {
            const current = gridCap[h] ?? null;
            gridCap[h] = current === null ? adj.max_grid_kwh : Math.min(current, adj.max_grid_kwh);
          }
        }
        break;
    }
  }

  return {
    demand,
    tariff,
    effSolar,
    minEnergy,
    chargeCap,
    dischargeCap,
    gridCap,
    capacity: b.capacity_kwh,
    initial: b.initial_energy_kwh,
  };
}

/**
 * Solves the 24-hour dispatch as a small LP:
 *   min  sum_h grid[h] * tariff[h]
 *   s.t. grid + solar + discharge - charge = demand          (balance)
 *        E[h] = E[h-1] + charge - discharge                  (battery dynamics)
 *        0 <= solar <= effSolar, charge/discharge <= caps,
 *        minEnergy[h] <= E[h] <= capacity, grid[h] <= gridCap,
 *        E[23] = initial                                     (neutrality)
 * Returns null when the LP is infeasible or the solver fails.
 */
export function solveScenario(eff: EffectiveScenario): HourlyPlanEntry[] | null {
  const constraints: Record<string, Record<string, number>> = {};
  const variables: Record<string, Record<string, number>> = {};

  for (let h = 0; h < 24; h++) {
    const g = `g${h}`;
    const s = `s${h}`;
    const c = `c${h}`;
    const d = `d${h}`;
    const E = `E${h}`;

    constraints[`bal_${h}`] = { equal: at(eff.demand, h) };
    constraints[`sol_${h}`] = { max: at(eff.effSolar, h) };
    constraints[`chg_${h}`] = { max: at(eff.chargeCap, h) };
    constraints[`dis_${h}`] = { max: at(eff.dischargeCap, h) };
    constraints[`emin_${h}`] = { min: at(eff.minEnergy, h) };
    constraints[`emax_${h}`] = { max: eff.capacity };
    const cap = eff.gridCap[h];
    if (cap !== null && cap !== undefined) {
      constraints[`gcap_${h}`] = { max: cap };
    }
    constraints[`link_${h}`] = { equal: h === 0 ? eff.initial : 0 };

    variables[g] = { cost: at(eff.tariff, h), [`bal_${h}`]: 1 };
    variables[s] = { [`bal_${h}`]: 1, [`sol_${h}`]: 1 };
    variables[c] = { [`bal_${h}`]: -1, [`chg_${h}`]: 1, [`link_${h}`]: -1 };
    variables[d] = { [`bal_${h}`]: 1, [`dis_${h}`]: 1, [`link_${h}`]: 1 };
    variables[E] = { [`emin_${h}`]: 1, [`emax_${h}`]: 1, [`link_${h}`]: 1 };
    if (cap !== null && cap !== undefined) variables[g][`gcap_${h}`] = 1;
    if (h < 23) variables[E][`link_${h + 1}`] = -1;
  }

  constraints.neutral = { equal: eff.initial };
  const e23 = variables.E23;
  if (!e23) throw new Error("LP variable E23 missing");
  e23.neutral = 1;

  let result: { feasible?: boolean; result?: number; [key: string]: unknown };
  try {
    result = solver.Solve({
      optimize: "cost",
      opType: "min",
      constraints,
      variables,
    }) as typeof result;
  } catch {
    return null;
  }

  if (!result || result.feasible === false) return null;

  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const EPS = 1e-9;
  const plan: HourlyPlanEntry[] = [];

  for (let h = 0; h < 24; h++) {
    const grid = Math.max(0, num(result[`g${h}`]));
    const solarUsed = Math.max(0, num(result[`s${h}`]));
    const charge = Math.max(0, num(result[`c${h}`]));
    const discharge = Math.max(0, num(result[`d${h}`]));
    const eAfter = num(result[`E${h}`]);

    const net = charge - discharge;
    let action: HourlyPlanEntry["battery_action"] = "idle";
    let kwh = 0;
    if (net > EPS) {
      action = "charge";
      kwh = net;
    } else if (net < -EPS) {
      action = "discharge";
      kwh = -net;
    }

    plan.push({
      hour: h,
      grid_kwh: round6(grid),
      solar_used_kwh: round6(solarUsed),
      battery_action: action,
      battery_kwh: round6(kwh),
      battery_energy_after_kwh: round6(eAfter),
    });
  }

  return plan;
}

function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

export function at(arr: number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`array index ${i} out of range`);
  return v;
}
