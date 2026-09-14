import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

const updateFeatureSchema = z.object({
  name: z.string().trim().min(1, "Nama feature tidak boleh kosong").optional(),
  description: z.string().trim().nullable().optional(),
  priority: z.enum(["must-have", "nice-to-have"]).optional(),
  order: z.number().int().positive().optional(),
});

async function getAuthorizedFeature(featureId: string, userId: string) {
  const [feature] = await db
    .select({
      id: features.id,
      planVersionId: features.planVersionId,
      name: features.name,
      description: features.description,
      priority: features.priority,
      order: features.order,
      createdAt: features.createdAt,
    })
    .from(features)
    .innerJoin(planVersions, eq(features.planVersionId, planVersions.id))
    .innerJoin(plans, eq(planVersions.planId, plans.id))
    .innerJoin(projects, eq(plans.projectId, projects.id))
    .where(and(eq(features.id, featureId), eq(projects.ownerId, userId)))
    .limit(1);

  return feature || null;
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

    const feature = await getAuthorizedFeature(featureId, userId);
    if (!feature) {
      return NextResponse.json(
        { error: "Feature tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    return NextResponse.json({ feature });
  } catch (error) {
    console.error("Error fetching feature:", error);
    return NextResponse.json({ error: "Gagal mengambil data feature" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { featureId } = await params;
    if (!featureId) {
      return NextResponse.json({ error: "Feature ID wajib diisi" }, { status: 400 });
    }

    const existingFeature = await getAuthorizedFeature(featureId, userId);
    if (!existingFeature) {
      return NextResponse.json(
        { error: "Feature tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = updateFeatureSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Validasi gagal", details: parseResult.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updateData = parseResult.data;
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ feature: existingFeature });
    }

    const [updated] = await db
      .update(features)
      .set(updateData)
      .where(eq(features.id, featureId))
      .returning();

    return NextResponse.json({ feature: updated });
  } catch (error) {
    console.error("Error updating feature:", error);
    return NextResponse.json({ error: "Gagal memperbarui feature" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { featureId } = await params;
    if (!featureId) {
      return NextResponse.json({ error: "Feature ID wajib diisi" }, { status: 400 });
    }

    const existingFeature = await getAuthorizedFeature(featureId, userId);
    if (!existingFeature) {
      return NextResponse.json(
        { error: "Feature tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // Pendekatan: Cascade delete transaksional (hapus task_dependencies & tasks terkait)
    // agar perencanaan fitur bersih tanpa membebani user menghapus satu per satu subtask.
    await db.transaction(async (tx) => {
      const existingTasks = await tx
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.featureId, featureId));

      if (existingTasks.length > 0) {
        const taskIds = existingTasks.map((t) => t.id);
        await tx.delete(taskDependencies).where(
          or(
            inArray(taskDependencies.taskId, taskIds),
            inArray(taskDependencies.dependsOnTaskId, taskIds)
          )
        );
        await tx.delete(tasks).where(eq(tasks.featureId, featureId));
      }

      await tx.delete(features).where(eq(features.id, featureId));
    });

    return NextResponse.json({ success: true, deletedFeatureId: featureId });
  } catch (error) {
    console.error("Error deleting feature:", error);
    return NextResponse.json({ error: "Gagal menghapus feature" }, { status: 500 });
  }
}
