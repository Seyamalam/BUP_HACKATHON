const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "GridWise LLM API",
    version: "1.0.0",
    description:
      "LLM-assisted smart campus energy optimization. Interprets natural-language operator notes into structured directives and returns a valid, cost-optimal 24-hour energy schedule.",
  },
  servers: [{ url: "https://gridwise-llm.seyamalam41.workers.dev" }],
  paths: {
    "/health": {
      get: {
        summary: "Readiness probe",
        responses: {
          "200": {
            description: "Service is ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string", example: "ok" } },
                  required: ["status"],
                },
              },
            },
          },
        },
      },
    },
    "/optimize-energy": {
      post: {
        summary: "Interpret operator notes and optimize the 24-hour schedule",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["scenario_id", "operator_notes", "hours", "battery"],
                properties: {
                  scenario_id: { type: "string", example: "GRID-101" },
                  operator_notes: {
                    type: "array",
                    minItems: 1,
                    maxItems: 3,
                    items: { type: "string", minLength: 1 },
                    example: ["Solar output will drop to about 20% from 1 PM to 3 PM."],
                  },
                  hours: {
                    type: "array",
                    minItems: 24,
                    maxItems: 24,
                    items: {
                      type: "object",
                      required: ["hour", "demand_kwh", "solar_kwh", "tariff_bdt_per_kwh"],
                      properties: {
                        hour: { type: "integer", minimum: 0, maximum: 23 },
                        demand_kwh: { type: "number", minimum: 0 },
                        solar_kwh: { type: "number", minimum: 0 },
                        tariff_bdt_per_kwh: { type: "number", minimum: 0 },
                      },
                    },
                  },
                  battery: {
                    type: "object",
                    required: [
                      "capacity_kwh",
                      "initial_energy_kwh",
                      "minimum_energy_kwh",
                      "max_charge_kwh_per_hour",
                      "max_discharge_kwh_per_hour",
                    ],
                    properties: {
                      capacity_kwh: { type: "number", exclusiveMinimum: 0 },
                      initial_energy_kwh: { type: "number", minimum: 0 },
                      minimum_energy_kwh: { type: "number", minimum: 0 },
                      max_charge_kwh_per_hour: { type: "number", minimum: 0 },
                      max_discharge_kwh_per_hour: { type: "number", minimum: 0 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Interpretation plus optimized 24-hour plan",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: [
                    "scenario_id",
                    "directive_interpretation",
                    "hourly_plan",
                    "total_grid_kwh",
                    "total_cost_bdt",
                    "peak_grid_kwh",
                    "plan_summary",
                  ],
                  properties: {
                    scenario_id: { type: "string" },
                    directive_interpretation: {
                      type: "array",
                      items: {
                        type: "object",
                        required: [
                          "note_index",
                          "applies",
                          "directive_type",
                          "structured_adjustment",
                          "explanation",
                        ],
                        properties: {
                          note_index: { type: "integer", minimum: 0 },
                          applies: { type: "boolean" },
                          directive_type: {
                            type: "string",
                            enum: [
                              "solar_reduction",
                              "minimum_battery_reserve",
                              "no_charge_window",
                              "no_discharge_window",
                              "max_grid_window",
                              "no_op",
                            ],
                          },
                          structured_adjustment: { nullable: true },
                          explanation: { type: "string" },
                        },
                      },
                    },
                    hourly_plan: {
                      type: "array",
                      minItems: 24,
                      maxItems: 24,
                      items: {
                        type: "object",
                        required: [
                          "hour",
                          "grid_kwh",
                          "solar_used_kwh",
                          "battery_action",
                          "battery_kwh",
                          "battery_energy_after_kwh",
                        ],
                        properties: {
                          hour: { type: "integer", minimum: 0, maximum: 23 },
                          grid_kwh: { type: "number", minimum: 0 },
                          solar_used_kwh: { type: "number", minimum: 0 },
                          battery_action: {
                            type: "string",
                            enum: ["charge", "discharge", "idle"],
                          },
                          battery_kwh: { type: "number", minimum: 0 },
                          battery_energy_after_kwh: { type: "number" },
                        },
                      },
                    },
                    total_grid_kwh: { type: "number" },
                    total_cost_bdt: { type: "number" },
                    peak_grid_kwh: { type: "number" },
                    plan_summary: { type: "string" },
                  },
                },
              },
            },
          },
          "400": { description: "Malformed JSON or structurally invalid request" },
          "422": { description: "Well-formed but semantically invalid request" },
          "500": { description: "Controlled internal error" },
        },
      },
    },
  },
};

const SCALAR_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GridWise LLM API</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

export function docsHtml(): string {
  return SCALAR_PAGE;
}

export function openApiSpec(): typeof OPENAPI_SPEC {
  return OPENAPI_SPEC;
}
