import type { Context } from "hono";
import { env } from "hono/adapter";

import { DEFAULT_MODELS } from "./llm";

export type AppConfig = {
  apiKey: string;
  models: string[];
};

/**
 * Reads runtime configuration from the platform env: Cloudflare Worker
 * bindings when deployed, process.env under Node (Docker / local dev).
 */
export function getConfig(c: Context): AppConfig {
  const e = env(c) as Record<string, string | undefined>;
  const apiKey = e.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ConfigError("OPENROUTER_API_KEY is not configured");
  }
  const models = (e.OPENROUTER_MODELS ?? DEFAULT_MODELS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return { apiKey, models };
}

export class ConfigError extends Error {}
