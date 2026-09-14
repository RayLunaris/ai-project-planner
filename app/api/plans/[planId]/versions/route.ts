import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, planVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;

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

    const versions = await db
      .select({
        id: planVersions.id,
        versionNumber: planVersions.versionNumber,
        changeSummary: planVersions.changeSummary,
        contentMarkdown: planVersions.contentMarkdown,
        contentJson: planVersions.contentJson,
        createdAt: planVersions.createdAt,
      })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.versionNumber));

    return NextResponse.json({
      versions,
      currentVersionId: userPlan.currentVersionId,
    });
  } catch (error) {
    console.error("Error fetching plan versions:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar versi PRD" },
      { status: 500 }
    );
  }
}
