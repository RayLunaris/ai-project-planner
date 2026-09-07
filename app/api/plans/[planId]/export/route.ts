import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, planVersions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    const { searchParams } = new URL(req.url);
    const requestedVersionId = searchParams.get("versionId");

    // Verify user owns the plan's project
    const [userPlan] = await db
      .select({
        planId: plans.id,
        currentVersionId: plans.currentVersionId,
        projectName: projects.name,
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

    // Determine target version: either explicitly requested or the current version
    const targetVersionId = requestedVersionId || userPlan.currentVersionId;

    if (!targetVersionId) {
      return NextResponse.json(
        { error: "Belum ada dokumen PRD yang digenerate untuk plan ini" },
        { status: 400 }
      );
    }

    // Fetch the version content
    const [version] = await db
      .select()
      .from(planVersions)
      .where(
        and(
          eq(planVersions.id, targetVersionId),
          eq(planVersions.planId, planId)
        )
      )
      .limit(1);

    if (!version) {
      return NextResponse.json(
        { error: "Versi PRD tidak ditemukan" },
        { status: 404 }
      );
    }

    // Extract product name from contentJson if available
    let productName = userPlan.projectName;
    if (
      version.contentJson &&
      typeof version.contentJson === "object" &&
      "productName" in version.contentJson &&
      typeof (version.contentJson as { productName?: unknown }).productName === "string"
    ) {
      productName = (version.contentJson as { productName: string }).productName;
    }

    const cleanName = sanitizeFilename(productName) || "project-plan";
    const filename = `prd-${cleanName}-v${version.versionNumber}.md`;

    return new Response(version.contentMarkdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Error exporting PRD markdown:", error);
    return NextResponse.json(
      { error: "Gagal mengekspor dokumen PRD" },
      { status: 500 }
    );
  }
}
