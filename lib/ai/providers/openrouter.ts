import { AIProvider } from "../gateway";

export class OpenRouterProvider implements AIProvider {
  private model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor(model: string, apiKey?: string, baseUrl?: string) {
    this.model = model;
    this.apiKey = apiKey || process.env.OPENROUTER_API_KEY || "";
    this.baseUrl = baseUrl || "https://openrouter.ai/api/v1";
  }

  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error("OPENROUTER_API_KEY is not configured in environment variables.");
    }

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "AI Project Planner",
    };
  }

  async generate(request: { system: string; prompt: string; jsonMode?: boolean }): Promise<string> {
    const headers = this.getHeaders();
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
    };

    if (request.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("Invalid response format received from OpenRouter API.");
    }

    return content;
  }

  async *stream(request: { system: string; prompt: string }): AsyncIterable<string> {
    const headers = this.getHeaders();
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.prompt },
      ],
      stream: true,
    };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter Streaming error (${response.status}): ${errorText}`);
    }

    if (!response.body) {
      throw new Error("Response body is empty or null.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":") || !trimmed.startsWith("data:")) continue;

          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content;
            if (deltaContent) {
              yield deltaContent;
            }
          } catch {
            // Ignore malformed JSON lines in SSE stream
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
