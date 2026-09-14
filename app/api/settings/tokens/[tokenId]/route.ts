import { NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { personalAccessTokens } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/settings/tokens/[tokenId]
 * Revoke (delete) a personal access token.
 * Only the token owner can revoke their own tokens.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const userId = await resolveUserId(_req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tokenId } = await params;

    // Delete only if the token belongs to the authenticated user
    const deleted = await db
      .delete(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.id, tokenId),
          eq(personalAccessTokens.userId, userId)
        )
      )
      .returning({ id: personalAccessTokens.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Token tidak ditemukan" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error revoking token:", error);
    return NextResponse.json(
      { error: "Gagal menghapus token" },
      { status: 500 }
    );
  }
}
