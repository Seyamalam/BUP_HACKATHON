import type { Context } from "hono";
import { env } from "hono/adapter";

import { DEFAULT_GATEWAY_MODELS, DEFAULT_GEMINI_MODELS, DEFAULT_OPENROUTER_MODELS } from "./llm";

export type AppConfig = {
  gatewayApiKey?: string;
  gatewayModels: string[];
  geminiApiKey?: string;
  geminiModels: string[];
  openrouterApiKey?: string;
  openrouterModels: string[];
};

/**
 * Reads runtime configuration from the platform env: Cloudflare Worker
 * bindings when deployed, process.env under Node (Docker / local dev).
 * At least one LLM provider key must be present.
 */
export function getConfig(c: Context): AppConfig {
  const e = env(c) as Record<string, string | undefined>;
  const gatewayApiKey = e.AI_GATEWAY_API_KEY || undefined;
  const geminiApiKey = e.GOOGLE_GENERATIVE_AI_API_KEY || e.GEMINI_API_KEY || undefined;
  const openrouterApiKey = e.OPENROUTER_API_KEY || undefined;
  if (!gatewayApiKey && !geminiApiKey && !openrouterApiKey) {
    throw new ConfigError("no LLM provider key configured");
  }
  const gatewayModels = (e.AI_GATEWAY_MODELS ?? DEFAULT_GATEWAY_MODELS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const geminiModels = (e.GEMINI_MODELS ?? DEFAULT_GEMINI_MODELS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const openrouterModels = (e.OPENROUTER_MODELS ?? DEFAULT_OPENROUTER_MODELS.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return {
    gatewayApiKey,
    gatewayModels,
    geminiApiKey,
    geminiModels,
    openrouterApiKey,
    openrouterModels,
  };
}

export class ConfigError extends Error {}
