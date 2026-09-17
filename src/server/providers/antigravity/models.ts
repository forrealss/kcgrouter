import type { ModelInfo } from "../types";

/**
 * Default model catalog for the Antigravity transport, mirroring the upstream
 * models exposed through Google's Cloud Code `v1internal` API (as mapped by
 * 9router's antigravity registry). The tiered suffixes (high/medium/low) select
 * the upstream thinking tier.
 */
export const antigravityModels: ModelInfo[] = [
  {
    id: "gemini-3.8-flash-high",
    name: "Gemini 3.8 Flash (High)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.8-flash-medium",
    name: "Gemini 3.8 Flash (Medium)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.8-flash-low",
    name: "Gemini 3.8 Flash (Low)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.7-flash-high",
    name: "Gemini 3.7 Flash (High)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.7-flash-medium",
    name: "Gemini 3.7 Flash (Medium)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.6-flash-high",
    name: "Gemini 3.6 Flash (High)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-3.5-flash-high",
    name: "Gemini 3.5 Flash (High)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "gemini-pro-agent",
    name: "Gemini 3.1 Pro (High)",
    contextLength: 1_048_576,
    maxOutputTokens: 64_000,
  },
  {
    id: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6 (Thinking)",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "claude-opus-4-6-thinking",
    name: "Claude Opus 4.6 (Thinking)",
    contextLength: 200_000,
    maxOutputTokens: 64_000,
  },
  {
    id: "gpt-oss-120b-medium",
    name: "GPT-OSS 120B (Medium)",
    contextLength: 131_072,
    maxOutputTokens: 32_768,
  },
];
