import { MODEL_REGISTRY, TaskType } from "./model-registry";
import { OpenRouterProvider } from "./providers/openrouter";
import { GeminiProvider } from "./providers/gemini";

export interface AIRequest {
  system: string;
  prompt: string;
  jsonMode?: boolean;
}

export interface AIProvider {
  generate(request: AIRequest): Promise<string>;
  stream(request: AIRequest): AsyncIterable<string>;
}

export interface AIProviderConfig {
  provider?: string | null;
  model?: string | null;
}

export function getAIProvider(
  task: TaskType,
  config?: AIProviderConfig
): AIProvider {
  const taskRegistryConfig = MODEL_REGISTRY[task];
  if (!taskRegistryConfig) {
    throw new Error(`No AI model registered for task: ${task}`);
  }

  // 1. Determine provider from config (plan), env var, or fallback
  const provider =
    config?.provider?.toLowerCase() ||
    process.env.AI_PROVIDER?.toLowerCase() ||
    (process.env.GEMINI_API_KEY ? "gemini" : taskRegistryConfig.provider || "openrouter");

  // 2. Route to GeminiProvider
  if (provider === "gemini") {
    // If selectedModel is specified and non-empty, use it.
    // Otherwise fallback to env GEMINI_MODEL or gemini-3.5-flash
    const model =
      config?.model?.trim() ||
      process.env.GEMINI_MODEL ||
      "gemini-3.5-flash";
    return new GeminiProvider(model);
  }

  // 3. Route to OpenRouterProvider
  if (provider === "openrouter") {
    // If selectedModel is specified and non-empty, use it.
    // Otherwise fallback to default from model-registry.ts
    const model = config?.model?.trim() || taskRegistryConfig.model;
    return new OpenRouterProvider(model);
  }

  throw new Error(`Unsupported AI provider: ${provider}`);
}
