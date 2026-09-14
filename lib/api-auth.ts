import { db } from "@/lib/db";
import { personalAccessTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashToken } from "./tokens";

export async function validateBearerToken(
  request: Request
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const rawToken = authHeader.substring(7); // Remove "Bearer "
  
  if (!rawToken || typeof rawToken !== "string") {
      return null;
  }

  const tokenHash = hashToken(rawToken);

  const [tokenRecord] = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.tokenHash, tokenHash))
    .limit(1);

  if (!tokenRecord) {
    return null;
  }

  // Update last used timestamp in the background
  // (we don't wait for it so the request isn't blocked)
  db.update(personalAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(personalAccessTokens.id, tokenRecord.id))
    .execute()
    .catch((err) => console.error("Failed to update token lastUsedAt", err));

  return tokenRecord.userId;
}
