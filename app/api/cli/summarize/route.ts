import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai/gateway";
import { resolveUserId } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const body = await req.json();
    const { filename, content } = body;

    if (!filename || typeof content !== "string") {
      return NextResponse.json(
        { error: "Missing filename or content in request body" },
        { status: 400 }
      );
    }

    // 3. Summarize using AI Gateway
    const aiProvider = getAIProvider("task-breakdown"); // Reuse existing task config or fallback to default
    
    const systemPrompt = `You are an expert developer. Your task is to summarize the contents of a codebase file in 1-2 very short sentences. Focus on its main purpose, functionality, and role in the project. Do not explain the code line-by-line. Output ONLY the summary string.`;
    
    // limit content length to avoid massive context sizes for very large files
    const userPrompt = `File: ${filename}\n\nContent:\n${content.substring(0, 15000)}`; 

    const summary = await aiProvider.generate({
      system: systemPrompt,
      prompt: userPrompt,
    });

    return NextResponse.json({ summary: summary.trim() });
  } catch (error: any) {
    console.error("CLI Summarize Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}
