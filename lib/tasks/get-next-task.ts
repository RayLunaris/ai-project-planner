import { db } from "@/lib/db";
import {
  plans,
  projects,
  planVersions,
  features,
  tasks,
  taskDependencies,
  type TaskStatus,
  type TaskLayer,
} from "@/lib/db/schema";
import { eq, and, asc, desc, inArray, ne } from "drizzle-orm";

export interface NextTask {
  id: string;
  featureId: string;
  featureName: string;
  title: string;
  description: string;
  layer: TaskLayer;
  phase: number;
  order: number;
  status: TaskStatus | null;
  targetFile: string | null;
  createdAt: Date | null;
  completedAt: Date | null;
}

/**
 * Mengambil task pertama berstatus 'todo' yang SEMUA dependency-nya sudah 'done',
 * diurutkan berdasarkan phase ASC lalu order ASC.
 *
 * Fungsi ini murni backend logic agar dapat digunakan kembali oleh MCP Server di Fase 3.
 *
 * @param planId - ID dari plan yang ingin diambil task berikutnya
 * @param userId - Opsional ID user pemilik untuk otorisasi akses
 * @returns NextTask atau null jika tidak ada task yang siap dikerjakan
 */
export async function getNextTask(
  planId: string,
  userId?: string
): Promise<NextTask | null> {
  // 1. Ambil data plan (verifikasi kepemilikan jika userId disertakan)
  const planQuery = db
    .select({
      id: plans.id,
      currentVersionId: plans.currentVersionId,
    })
    .from(plans)
    .innerJoin(projects, eq(plans.projectId, projects.id));

  const planWhere = userId
    ? and(eq(plans.id, planId), eq(projects.ownerId, userId))
    : eq(plans.id, planId);

  const [plan] = await planQuery.where(planWhere).limit(1);
  if (!plan) return null;

  // 2. Tentukan versi aktif PRD
  let versionId = plan.currentVersionId;
  if (!versionId) {
    const [latestVersion] = await db
      .select({ id: planVersions.id })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);
    versionId = latestVersion?.id ?? null;
  }
  if (!versionId) return null;

  // 3. Ambil semua kandidat task dengan status 'todo', urut phase ASC lalu order ASC
  const candidateTasks = await db
    .select({
      id: tasks.id,
      featureId: tasks.featureId,
      featureName: features.name,
      title: tasks.title,
      description: tasks.description,
      layer: tasks.layer,
      phase: tasks.phase,
      order: tasks.order,
      status: tasks.status,
      targetFile: tasks.targetFile,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .innerJoin(features, eq(tasks.featureId, features.id))
    .where(
      and(
        eq(features.planVersionId, versionId),
        eq(tasks.status, "todo")
      )
    )
    .orderBy(asc(tasks.phase), asc(tasks.order));

  if (candidateTasks.length === 0) return null;

  const candidateIds = candidateTasks.map((t) => t.id);

  // 4. Periksa dependensi: cari semua dependency yang statusnya belum 'done'
  const incompleteDependencies = await db
    .select({
      taskId: taskDependencies.taskId,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(
      and(
        inArray(taskDependencies.taskId, candidateIds),
        ne(tasks.status, "done")
      )
    );

  const blockedTaskIds = new Set(incompleteDependencies.map((d) => d.taskId));

  // 5. Kembalikan task pertama yang semua dependensinya terpenuhi (tidak terblokir)
  const eligibleTask = candidateTasks.find((t) => !blockedTaskIds.has(t.id));
  return eligibleTask ?? null;
}
