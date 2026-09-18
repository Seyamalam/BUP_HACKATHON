import { z } from "zod";

export const DIRECTIVE_TYPES = [
  "solar_reduction",
  "minimum_battery_reserve",
  "no_charge_window",
  "no_discharge_window",
  "max_grid_window",
  "no_op",
] as const;

export type DirectiveType = (typeof DIRECTIVE_TYPES)[number];

export const hourEntrySchema = z.object({
  hour: z.number().int().min(0).max(23),
  demand_kwh: z.number().finite().nonnegative(),
  solar_kwh: z.number().finite().nonnegative(),
  tariff_bdt_per_kwh: z.number().finite().nonnegative(),
});

export const batterySchema = z.object({
  capacity_kwh: z.number().finite().positive(),
  initial_energy_kwh: z.number().finite().nonnegative(),
  minimum_energy_kwh: z.number().finite().nonnegative(),
  max_charge_kwh_per_hour: z.number().finite().nonnegative(),
  max_discharge_kwh_per_hour: z.number().finite().nonnegative(),
});

export const requestSchema = z
  .object({
    scenario_id: z.string().min(1),
    operator_notes: z.array(z.string().min(1)).min(1).max(3),
    hours: z.array(hourEntrySchema).length(24),
    battery: batterySchema,
  })
  .superRefine((val, ctx) => {
    const seen = new Set<number>();
    for (const h of val.hours) {
      if (seen.has(h.hour)) {
        ctx.addIssue({ code: "custom", message: `duplicate hour ${h.hour}` });
      }
      seen.add(h.hour);
    }
    for (let i = 0; i < 24; i++) {
      if (!seen.has(i)) {
        ctx.addIssue({ code: "custom", message: `missing hour ${i}` });
      }
    }
    const b = val.battery;
    if (b.minimum_energy_kwh > b.capacity_kwh) {
      ctx.addIssue({ code: "custom", message: "minimum_energy_kwh exceeds capacity_kwh" });
    }
    if (b.initial_energy_kwh > b.capacity_kwh) {
      ctx.addIssue({ code: "custom", message: "initial_energy_kwh exceeds capacity_kwh" });
    }
  });

export type HourEntry = z.infer<typeof hourEntrySchema>;
export type Battery = z.infer<typeof batterySchema>;
export type OptimizeRequest = z.infer<typeof requestSchema>;

export type StructuredAdjustment =
  | { hours: number[]; factor: number }
  | { hours: number[]; minimum_energy_kwh: number }
  | { hours: number[] }
  | { hours: number[]; max_grid_kwh: number }
  | null;

export type DirectiveInterpretation = {
  note_index: number;
  applies: boolean;
  directive_type: DirectiveType;
  structured_adjustment: StructuredAdjustment;
  explanation: string;
};

export type HourlyPlanEntry = {
  hour: number;
  grid_kwh: number;
  solar_used_kwh: number;
  battery_action: "charge" | "discharge" | "idle";
  battery_kwh: number;
  battery_energy_after_kwh: number;
};

export type OptimizeResponse = {
  scenario_id: string;
  directive_interpretation: DirectiveInterpretation[];
  hourly_plan: HourlyPlanEntry[];
  total_grid_kwh: number;
  total_cost_bdt: number;
  peak_grid_kwh: number;
  plan_summary: string;
};
