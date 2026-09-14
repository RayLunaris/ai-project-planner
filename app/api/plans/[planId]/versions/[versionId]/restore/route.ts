import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, planVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ planId: string; versionId: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId, versionId } = await params;

    // Verify user owns the plan's project
    const [userPlan] = await db
      .select({
        planId: plans.id,
        currentVersionId: plans.currentVersionId,
        status: plans.status,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, session.user.id)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // Verify the version exists for this plan
    const [targetVersion] = await db
      .select()
      .from(planVersions)
      .where(
        and(
          eq(planVersions.id, versionId),
          eq(planVersions.planId, planId)
        )
      )
      .limit(1);

    if (!targetVersion) {
      return NextResponse.json(
        { error: "Versi PRD yang dituju tidak ditemukan" },
        { status: 404 }
      );
    }

    // Set as current version in plans table
    await db
      .update(plans)
      .set({
        currentVersionId: versionId,
        status: "generated",
      })
      .where(eq(plans.id, planId));

    return NextResponse.json({
      success: true,
      currentVersionId: versionId,
      restoredVersion: {
        id: targetVersion.id,
        versionNumber: targetVersion.versionNumber,
        contentMarkdown: targetVersion.contentMarkdown,
        changeSummary: targetVersion.changeSummary,
        createdAt: targetVersion.createdAt,
      },
    });
  } catch (error) {
    console.error("Error restoring plan version:", error);
    return NextResponse.json(
      { error: "Gagal me-restore versi PRD" },
      { status: 500 }
    );
  }
}
