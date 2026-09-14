import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  tasks,
  taskDependencies,
  features,
  planVersions,
  plans,
  projects,
} from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ taskId: string }>;
}

const updateStatusSchema = z.object({
  status: z.enum(["todo", "doing", "blocked", "done", "failed"], {
    message: "Status harus salah satu dari: todo, doing, blocked, done, failed",
  }),
});

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;
    if (!taskId) {
      return NextResponse.json({ error: "Task ID wajib diisi" }, { status: 400 });
    }

    // 1. Verifikasi payload status
    const body = await req.json().catch(() => ({}));
    const parseResult = updateStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validasi gagal",
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }
    const { status: newStatus } = parseResult.data;

    // 2. Ambil task dan verifikasi kepemilikan
    const [targetTask] = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .innerJoin(features, eq(tasks.featureId, features.id))
      .innerJoin(planVersions, eq(features.planVersionId, planVersions.id))
      .innerJoin(plans, eq(planVersions.planId, plans.id))
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(tasks.id, taskId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!targetTask) {
      return NextResponse.json(
        { error: "Task tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // 3. Validasi aturan dependency jika ingin mengubah status ke "doing"
    if (newStatus === "doing") {
      const incompleteDependencies = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
        })
        .from(taskDependencies)
        .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
        .where(
          and(
            eq(taskDependencies.taskId, taskId),
            ne(tasks.status, "done")
          )
        );

      if (incompleteDependencies.length > 0) {
        const pendingNames = incompleteDependencies
          .map((d) => `"${d.title}" (status: ${d.status})`)
          .join(", ");

        return NextResponse.json(
          {
            error: `Task "${targetTask.title}" tidak dapat diubah ke status 'doing' karena masih ada dependensi yang belum selesai: ${pendingNames}`,
            incompleteDependencies,
          },
          { status: 400 }
        );
      }
    }

    // 4. Update status dan completedAt
    const [updatedTask] = await db
      .update(tasks)
      .set({
        status: newStatus,
        completedAt: newStatus === "done" ? new Date() : null,
      })
      .where(eq(tasks.id, taskId))
      .returning();

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task status:", error);
    return NextResponse.json(
      { error: "Gagal memperbarui status task" },
      { status: 500 }
    );
  }
}
