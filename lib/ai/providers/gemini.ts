import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider } from "../gateway";

const DEPRECATED_GEMINI_MODELS: Record<string, string> = {
  "gemini-2.5-flash": "gemini-3.5-flash",
  "gemini-2.5-pro": "gemini-3.5-flash",
  "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
  "gemini-2.0-flash": "gemini-3.5-flash",
  "gemini-2.0-flash-exp": "gemini-3.5-flash",
  "gemini-1.5-flash": "gemini-3.5-flash",
  "gemini-1.5-pro": "gemini-3.5-flash",
  "gemini-flash-latest": "gemini-3.5-flash",
  "gemini-pro-latest": "gemini-3.5-flash",
};

function normalizeGeminiModel(model?: string | null): string {
  const trimmed = model?.trim();
  if (!trimmed) {
    return process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
  }
  if (DEPRECATED_GEMINI_MODELS[trimmed]) {
    return DEPRECATED_GEMINI_MODELS[trimmed];
  }
  return trimmed;
}

export class GeminiProvider implements AIProvider {
  private model: string;
  private apiKey: string;
  private client: GoogleGenerativeAI | null = null;

  constructor(model?: string, apiKey?: string) {
    this.model = normalizeGeminiModel(model);
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured in environment variables.");
    }
    if (!this.client) {
      this.client = new GoogleGenerativeAI(this.apiKey);
    }
    return this.client;
  }

  async generate(request: { system: string; prompt: string; jsonMode?: boolean }): Promise<string> {
    const genAI = this.getClient();
    const tryModels = [this.model];
    if (this.model !== "gemini-3.5-flash") {
      tryModels.push("gemini-3.5-flash");
    }
    if (this.model !== "gemini-3.1-flash-lite" && !tryModels.includes("gemini-3.1-flash-lite")) {
      tryModels.push("gemini-3.1-flash-lite");
    }

    let lastError: unknown;
    for (const candidateModel of tryModels) {
      try {
        const generativeModel = genAI.getGenerativeModel({
          model: candidateModel,
          systemInstruction: request.system || undefined,
          generationConfig: request.jsonMode ? { responseMimeType: "application/json" } : undefined,
        });

        const result = await generativeModel.generateContent(request.prompt);
        const response = await result.response;
        const text = response.text();

        if (typeof text !== "string") {
          throw new Error("Invalid response format received from Gemini API.");
        }

        return text;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStatus = (err as { status?: number })?.status;
        console.warn(`Gemini generation failed on model '${candidateModel}':`, errMsg);

        const isRecoverable =
          errStatus === 404 ||
          errStatus === 503 ||
          errMsg.includes("no longer available") ||
          errMsg.includes("high demand") ||
          errMsg.includes("not found");

        if (!isRecoverable) {
          throw err;
        }
      }
    }

    throw lastError;
  }

  async *stream(request: { system: string; prompt: string; jsonMode?: boolean }): AsyncIterable<string> {
    const genAI = this.getClient();
    const tryModels = [this.model];
    if (this.model !== "gemini-3.5-flash") {
      tryModels.push("gemini-3.5-flash");
    }
    if (this.model !== "gemini-3.1-flash-lite" && !tryModels.includes("gemini-3.1-flash-lite")) {
      tryModels.push("gemini-3.1-flash-lite");
    }

    let lastError: unknown;
    for (const candidateModel of tryModels) {
      try {
        const generativeModel = genAI.getGenerativeModel({
          model: candidateModel,
          systemInstruction: request.system || undefined,
          generationConfig: request.jsonMode ? { responseMimeType: "application/json" } : undefined,
        });

        const resultStream = await generativeModel.generateContentStream(request.prompt);

        for await (const chunk of resultStream.stream) {
          try {
            const chunkText = chunk.text();
            if (chunkText) {
              yield chunkText;
            }
          } catch (err) {
            console.warn("Gemini stream chunk extraction error:", err);
          }
        }
        return;
      } catch (err: unknown) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : String(err);
        const errStatus = (err as { status?: number })?.status;
        console.warn(`Gemini stream failed on model '${candidateModel}':`, errMsg);

        const isRecoverable =
          errStatus === 404 ||
          errStatus === 503 ||
          errMsg.includes("no longer available") ||
          errMsg.includes("high demand") ||
          errMsg.includes("not found");

        if (!isRecoverable) {
          throw err;
        }
      }
    }

    throw lastError;
  }
}

