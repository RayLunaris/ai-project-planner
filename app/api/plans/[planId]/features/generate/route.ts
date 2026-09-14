import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  plans,
  projects,
  planVersions,
  features,
  tasks,
  taskDependencies,
} from "@/lib/db/schema";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import {
  buildFeatureBreakdownPrompt,
  generateFeatureBreakdownWithRetry,
} from "@/lib/prompts/feature-breakdown";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json({ error: "Plan ID wajib diisi" }, { status: 400 });
    }

    // 1. Verifikasi kepemilikan plan & ambil provider config
    const [userPlan] = await db
      .select({
        id: plans.id,
        projectId: plans.projectId,
        status: plans.status,
        currentVersionId: plans.currentVersionId,
        selectedProvider: plans.selectedProvider,
        selectedModel: plans.selectedModel,
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

    // 2. Ambil current version dari plan_versions
    let currentVersion = null;
    if (userPlan.currentVersionId) {
      const [version] = await db
        .select()
        .from(planVersions)
        .where(
          and(
            eq(planVersions.id, userPlan.currentVersionId),
            eq(planVersions.planId, planId)
          )
        )
        .limit(1);
      currentVersion = version;
    }

    if (!currentVersion) {
      const [latest] = await db
        .select()
        .from(planVersions)
        .where(eq(planVersions.planId, planId))
        .orderBy(desc(planVersions.versionNumber))
        .limit(1);
      currentVersion = latest;
    }

    if (!currentVersion || !currentVersion.contentJson) {
      return NextResponse.json(
        {
          error:
            "PRD belum digenerate untuk plan ini. Silakan selesaikan klarifikasi dan buat PRD terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    // 3. Panggil AI Gateway dengan prompt feature-breakdown
    const aiProvider = getAIProvider("feature-breakdown", {
      provider: userPlan.selectedProvider,
      model: userPlan.selectedModel,
    });

    const prompt = buildFeatureBreakdownPrompt({
      prd: currentVersion.contentJson as Record<string, unknown>,
    });

    const result = await generateFeatureBreakdownWithRetry(aiProvider, prompt);

    const featuresToInsert = result.features.map((f, idx) => ({
      planVersionId: currentVersion.id,
      name: f.name,
      description: f.description,
      priority: f.priority,
      order: f.order ?? idx + 1,
    }));

    // 4. Simpan hasil ke tabel features (transaksional)
    const savedFeatures = await db.transaction(async (tx) => {
      // Hapus data lama jika ada proses generate ulang untuk versi ini
      const existing = await tx
        .select({ id: features.id })
        .from(features)
        .where(eq(features.planVersionId, currentVersion.id));

      if (existing.length > 0) {
        const featureIds = existing.map((f) => f.id);
        const existingTasks = await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(inArray(tasks.featureId, featureIds));

        if (existingTasks.length > 0) {
          const taskIds = existingTasks.map((t) => t.id);
          await tx.delete(taskDependencies).where(
            or(
              inArray(taskDependencies.taskId, taskIds),
              inArray(taskDependencies.dependsOnTaskId, taskIds)
            )
          );
          await tx.delete(tasks).where(inArray(tasks.id, taskIds));
        }

        await tx
          .delete(features)
          .where(eq(features.planVersionId, currentVersion.id));
      }

      return await tx.insert(features).values(featuresToInsert).returning();
    });

    return NextResponse.json({
      success: true,
      features: savedFeatures,
    });
  } catch (error) {
    console.error("Error generating features:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal membedah fitur dari PRD",
      },
      { status: 500 }
    );
  }
}
