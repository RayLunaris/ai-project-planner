import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  features,
  planVersions,
  plans,
  projects,
  tasks,
  taskDependencies,
} from "@/lib/db/schema";
import { eq, and, inArray, or } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import {
  buildTaskBreakdownPrompt,
  generateTaskBreakdownWithRetry,
} from "@/lib/prompts/task-breakdown";

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { featureId } = await params;
    if (!featureId) {
      return NextResponse.json({ error: "Feature ID wajib diisi" }, { status: 400 });
    }

    // 1. Ambil detail feature, PRD contentJson, dan AI config dalam satu query
    const [featureData] = await db
      .select({
        id: features.id,
        name: features.name,
        description: features.description,
        priority: features.priority,
        planVersionId: features.planVersionId,
        selectedProvider: plans.selectedProvider,
        selectedModel: plans.selectedModel,
        contentJson: planVersions.contentJson,
      })
      .from(features)
      .innerJoin(planVersions, eq(features.planVersionId, planVersions.id))
      .innerJoin(plans, eq(planVersions.planId, plans.id))
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(features.id, featureId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!featureData) {
      return NextResponse.json(
        { error: "Feature tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // 2. Panggil AI Gateway dengan prompt task-breakdown
    const aiProvider = getAIProvider("task-breakdown", {
      provider: featureData.selectedProvider,
      model: featureData.selectedModel,
    });

    const prompt = buildTaskBreakdownPrompt({
      feature: {
        name: featureData.name,
        description: featureData.description,
        priority: featureData.priority,
      },
      prdContext: (featureData.contentJson as Record<string, unknown>) || {},
    });

    // Validasi Zod dan Section 7 check (reject & retry bila ada missing task dependency)
    const result = await generateTaskBreakdownWithRetry(aiProvider, prompt);

    // 3. Simpan tasks & resolve task_dependencies secara transaksional
    const saved = await db.transaction(async (tx) => {
      // Hapus task lama dan dependency lama untuk feature ini jika generate ulang
      const existingTasks = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.featureId, featureId));

      if (existingTasks.length > 0) {
        const oldTaskIds = existingTasks.map((t) => t.id);
        await tx.delete(taskDependencies).where(
          or(
            inArray(taskDependencies.taskId, oldTaskIds),
            inArray(taskDependencies.dependsOnTaskId, oldTaskIds)
          )
        );
        await tx.delete(tasks).where(eq(tasks.featureId, featureId));
      }

      // Insert tasks baru
      const insertedTasks = await tx
        .insert(tasks)
        .values(
          result.tasks.map((t) => ({
            featureId,
            title: t.title,
            description: t.description,
            layer: t.layer,
            phase: t.phase,
            order: t.order,
            targetFile: t.targetFile,
            status: "todo" as const,
          }))
        )
        .returning();

      // Buat mapping nama judul (lowercase) -> task ID
      const titleToIdMap = new Map<string, string>();
      for (const t of insertedTasks) {
        titleToIdMap.set(t.title.toLowerCase().trim(), t.id);
      }

      // Resolve dependsOnTitles -> id dan deduplikasi pasangan dependency
      const dependencyPairs = new Set<string>();
      const depRows: { taskId: string; dependsOnTaskId: string }[] = [];

      for (const item of result.tasks) {
        const currentTaskId = titleToIdMap.get(item.title.toLowerCase().trim());
        if (!currentTaskId) continue;

        for (const depTitle of item.dependsOnTitles) {
          const dependsOnId = titleToIdMap.get(depTitle.toLowerCase().trim());
          if (dependsOnId && dependsOnId !== currentTaskId) {
            const pairKey = `${currentTaskId}:${dependsOnId}`;
            if (!dependencyPairs.has(pairKey)) {
              dependencyPairs.add(pairKey);
              depRows.push({
                taskId: currentTaskId,
                dependsOnTaskId: dependsOnId,
              });
            }
          }
        }
      }

      let insertedDeps: typeof taskDependencies.$inferSelect[] = [];
      if (depRows.length > 0) {
        insertedDeps = await tx
          .insert(taskDependencies)
          .values(depRows)
          .returning();
      }

      return {
        tasks: insertedTasks,
        dependencies: insertedDeps,
      };
    });

    return NextResponse.json({
      success: true,
      tasks: saved.tasks,
      dependencies: saved.dependencies,
    });
  } catch (error) {
    console.error("Error generating tasks for feature:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gagal membedah tasks dari feature",
      },
      { status: 500 }
    );
  }
}
