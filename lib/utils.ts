export function extractJson(raw: string): unknown {
  let text = raw.trim();

  // 1. Check if wrapped in markdown code fence
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  } else if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }

  // 2. Direct JSON parse
  try {
    return JSON.parse(text);
  } catch {
    // 3. Fallback: extract substring between first '{' and last '}'
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonCandidate);
    }
    
    // Also try array '[' and ']'
    const firstBracket = text.indexOf("[");
    const lastBracket = text.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonCandidate = text.slice(firstBracket, lastBracket + 1);
      return JSON.parse(jsonCandidate);
    }

    throw new Error("Tidak dapat menemukan objek JSON yang valid pada respons AI");
  }
}
