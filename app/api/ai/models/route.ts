import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ModelOption {
  id: string;
  displayName: string;
}

interface CacheEntry {
  data: ModelOption[];
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
let geminiModelsCache: CacheEntry | null = null;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider") || "gemini";

    if (provider === "openrouter") {
      return NextResponse.json([
        { id: "deepseek/deepseek-chat", displayName: "DeepSeek Chat (V3)" },
      ]);
    }

    if (provider !== "gemini") {
      return NextResponse.json(
        { error: `Provider '${provider}' tidak didukung. Pilihan provider: 'gemini' atau 'openrouter'.` },
        { status: 400 }
      );
    }

    const now = Date.now();
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!forceRefresh && geminiModelsCache && now - geminiModelsCache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(geminiModelsCache.data, {
        headers: {
          "X-Cache": "HIT",
        },
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY belum dikonfigurasi di environment variables." },
        { status: 500 }
      );
    }

    const rawModels: Array<{
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
    }> = [];

    let pageToken = "";
    do {
      const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1000${pageParam}`;

      const res = await fetch(url);
      if (!res.ok) {
        const errorText = await res.text();
        return NextResponse.json(
          { error: `Google AI Studio API error (${res.status}): ${errorText}` },
          { status: res.status }
        );
      }

      const json = await res.json();
      if (Array.isArray(json.models)) {
        rawModels.push(...json.models);
      }
      pageToken = json.nextPageToken || "";
    } while (pageToken);

    const preferredOrder = [
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ];

    const filteredModels: ModelOption[] = rawModels
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => {
        const id = m.name.replace(/^models\//, "");
        return {
          id,
          displayName: m.displayName || id,
        };
      })
      .filter((m) => {
        const id = m.id.toLowerCase();
        // Exclude deprecated/retired models (404 on generateContent)
        if (id.startsWith("gemini-1.") || id.startsWith("gemini-2.")) return false;
        if (id.includes("latest")) return false;
        // Exclude non-text, image, audio, tts, robotics, or research preview models
        if (
          id.includes("tts") ||
          id.includes("image") ||
          id.includes("banana") ||
          id.includes("lyria") ||
          id.includes("transcribe") ||
          id.includes("robotics") ||
          id.includes("computer-use") ||
          id.includes("deep-research") ||
          id.includes("antigravity")
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const idxA = preferredOrder.indexOf(a.id);
        const idxB = preferredOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.displayName.localeCompare(b.displayName);
      });

    geminiModelsCache = {
      data: filteredModels,
      timestamp: now,
    };

    return NextResponse.json(filteredModels, {
      headers: {
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("Error fetching AI models:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar model AI" },
      { status: 500 }
    );
  }
}
