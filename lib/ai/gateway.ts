import { MODEL_REGISTRY, TaskType } from "./model-registry";
import { OpenRouterProvider } from "./providers/openrouter";

export interface AIProvider {
  generate(request: { system: string; prompt: string; jsonMode?: boolean }): Promise<string>;
  stream(request: { system: string; prompt: string }): AsyncIterable<string>;
}

export function getAIProvider(task: TaskType): AIProvider {
  const config = MODEL_REGISTRY[task];
  if (!config) {
    throw new Error(`No AI model registered for task: ${task}`);
  }

  if (config.provider === "openrouter") {
    return new OpenRouterProvider(config.model);
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}
