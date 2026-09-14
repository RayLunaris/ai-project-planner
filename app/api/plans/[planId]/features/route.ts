import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, planVersions, features } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json({ error: "Plan ID wajib diisi" }, { status: 400 });
    }

    // 1. Verifikasi kepemilikan plan
    const [userPlan] = await db
      .select({
        id: plans.id,
        currentVersionId: plans.currentVersionId,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // 2. Tentukan versi aktif
    let versionId = userPlan.currentVersionId;
    if (!versionId) {
      const [latest] = await db
        .select({ id: planVersions.id })
        .from(planVersions)
        .where(eq(planVersions.planId, planId))
        .orderBy(desc(planVersions.versionNumber))
        .limit(1);
      versionId = latest?.id ?? null;
    }

    if (!versionId) {
      return NextResponse.json({ success: true, features: [] });
    }

    // 3. Ambil daftar fitur yang terkait dengan versi aktif PRD
    const featureList = await db
      .select()
      .from(features)
      .where(eq(features.planVersionId, versionId))
      .orderBy(asc(features.order));

    return NextResponse.json({
      success: true,
      features: featureList,
    });
  } catch (error) {
    console.error("Error fetching features:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar fitur" },
      { status: 500 }
    );
  }
}
