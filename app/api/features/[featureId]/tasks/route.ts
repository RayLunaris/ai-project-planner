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
import { eq, and, asc, inArray } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { featureId } = await params;
    if (!featureId) {
      return NextResponse.json({ error: "Feature ID wajib diisi" }, { status: 400 });
    }

    // 1. Verifikasi kepemilikan feature
    const [feature] = await db
      .select({ id: features.id })
      .from(features)
      .innerJoin(planVersions, eq(features.planVersionId, planVersions.id))
      .innerJoin(plans, eq(planVersions.planId, plans.id))
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(features.id, featureId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!feature) {
      return NextResponse.json(
        { error: "Feature tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // 2. Ambil daftar tasks urut phase lalu order
    const featureTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.featureId, featureId))
      .orderBy(asc(tasks.phase), asc(tasks.order));

    // 3. Ambil dependencies untuk setiap task dalam feature
    const taskIds = featureTasks.map((t) => t.id);
    let deps: { taskId: string; dependsOnTitle: string }[] = [];
    if (taskIds.length > 0) {
      deps = await db
        .select({
          taskId: taskDependencies.taskId,
          dependsOnTitle: tasks.title,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
        .where(inArray(taskDependencies.taskId, taskIds));
    }

    const tasksWithDependencies = featureTasks.map((t) => ({
      ...t,
      dependencies: deps
        .filter((d) => d.taskId === t.id)
        .map((d) => d.dependsOnTitle),
    }));

    return NextResponse.json({
      success: true,
      tasks: tasksWithDependencies,
    });
  } catch (error) {
    console.error("Error fetching tasks for feature:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar tasks" },
      { status: 500 }
    );
  }
}
