import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalAccessTokens } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { generateToken, hashToken } from "@/lib/tokens";

const createTokenSchema = z.object({
  label: z.string().trim().max(100).optional(),
});

/**
 * GET /api/settings/tokens
 * List all personal access tokens for the authenticated user.
 * Returns metadata only — never exposes the hash or raw token.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tokens = await db
      .select({
        id: personalAccessTokens.id,
        label: personalAccessTokens.label,
        createdAt: personalAccessTokens.createdAt,
        lastUsedAt: personalAccessTokens.lastUsedAt,
      })
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.userId, userId))
      .orderBy(desc(personalAccessTokens.createdAt));

    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar token" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/tokens
 * Generate a new personal access token.
 * Returns the raw token ONCE — it is never stored, only the SHA-256 hash is persisted.
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = createTokenSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);

    const [created] = await db
      .insert(personalAccessTokens)
      .values({
        userId: userId,
        tokenHash,
        label: result.data.label || null,
      })
      .returning({
        id: personalAccessTokens.id,
        label: personalAccessTokens.label,
        createdAt: personalAccessTokens.createdAt,
        lastUsedAt: personalAccessTokens.lastUsedAt,
      });

    return NextResponse.json(
      {
        token: {
          ...created,
          rawToken, // shown to user ONCE — never stored or returned again
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating token:", error);
    return NextResponse.json(
      { error: "Gagal membuat token baru" },
      { status: 500 }
    );
  }
}
