export const MODEL_REGISTRY = {
  clarification: {
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    tier: "cheap",
  },
  "prd-generation": {
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    tier: "balanced",
  },
  "prd-revision": {
    provider: "openrouter",
    model: "deepseek/deepseek-chat",
    tier: "balanced",
  },
} as const;

export type TaskType = keyof typeof MODEL_REGISTRY;
