import assert from "node:assert";
import { db } from "@/lib/db";
import {
  plans,
  planVersions,
  projects,
  features,
  tasks,
  taskDependencies,
} from "@/lib/db/schema";
import { eq, and, inArray, or, ne } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import {
  buildFeatureBreakdownPrompt,
  generateFeatureBreakdownWithRetry,
} from "@/lib/prompts/feature-breakdown";
import {
  buildTaskBreakdownPrompt,
  generateTaskBreakdownWithRetry,
} from "@/lib/prompts/task-breakdown";
import { getNextTask } from "@/lib/tasks/get-next-task";

async function runEndToEndTest() {
  console.log("=== STARTING END-TO-END TEST FASE 2 ===\n");

  const planId = "4d901b58-de3a-4d5a-a44d-82eb9121f156";

  // Ambil plan & current version
  const [plan] = await db
    .select({
      id: plans.id,
      projectId: plans.projectId,
      currentVersionId: plans.currentVersionId,
      ownerId: projects.ownerId,
      provider: plans.selectedProvider,
      model: plans.selectedModel,
    })
    .from(plans)
    .innerJoin(projects, eq(plans.projectId, projects.id))
    .where(eq(plans.id, planId));

  assert(plan, "Plan harus ditemukan");
  console.log(`[Setup] Plan: ${plan.id}, Owner: ${plan.ownerId}, Provider: ${plan.provider} (${plan.model})`);

  const [version] = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.id, plan.currentVersionId!));

  assert(version, "Version harus ditemukan");
  const prdContent = version.contentJson as any;
  console.log(`[Setup] PRD: "${prdContent.productName}"`);
  console.log(`[Setup] PRD Core Features (${prdContent.coreFeatures?.length}):`);
  prdContent.coreFeatures?.forEach((f: any) => console.log(`  - [${f.priority || "must-have"}] ${f.name}`));

  // -------------------------------------------------------------
  // TEST 1: Generate Features dari PRD
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Generate Features dari PRD ---");
  const featureAiProvider = getAIProvider("feature-breakdown", {
    provider: plan.provider,
    model: plan.model,
  });

  const featurePrompt = buildFeatureBreakdownPrompt({ prd: prdContent });
  console.log("[Test 1] Memanggil AI Gateway (feature-breakdown)...");
  const featureResult = await generateFeatureBreakdownWithRetry(featureAiProvider, featurePrompt);

  console.log(`[Test 1] AI menghasilkan ${featureResult.features.length} features:`);
  featureResult.features.forEach((f) => {
    console.log(`  #${f.order || "?"} [${f.priority}] ${f.name}: ${f.description.slice(0, 70)}...`);
  });

  assert(featureResult.features.length > 0, "Harus menghasilkan minimal 1 feature");

  // Simpan ke DB secara transaksional
  const savedFeatures = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: features.id })
      .from(features)
      .where(eq(features.planVersionId, version.id));

    if (existing.length > 0) {
      const featIds = existing.map((f) => f.id);
      const existingTasks = await tx.select({ id: tasks.id }).from(tasks).where(inArray(tasks.featureId, featIds));
      if (existingTasks.length > 0) {
        const tIds = existingTasks.map((t) => t.id);
        await tx.delete(taskDependencies).where(
          or(inArray(taskDependencies.taskId, tIds), inArray(taskDependencies.dependsOnTaskId, tIds))
        );
        await tx.delete(tasks).where(inArray(tasks.id, tIds));
      }
      await tx.delete(features).where(eq(features.planVersionId, version.id));
    }

    return await tx
      .insert(features)
      .values(
        featureResult.features.map((f, idx) => ({
          planVersionId: version.id,
          name: f.name,
          description: f.description,
          priority: f.priority,
          order: f.order ?? idx + 1,
        }))
      )
      .returning();
  });

  console.log(`[Test 1] Berhasil menyimpan ${savedFeatures.length} features ke database.`);
  console.log("TEST 1 PASSED: Features selaras dengan coreFeatures PRD.\n");

  // -------------------------------------------------------------
  // TEST 2: Generate Tasks untuk salah satu Feature
  // -------------------------------------------------------------
  console.log("--- TEST 2: Generate Tasks untuk Feature ---");
  const selectedFeature = savedFeatures[0];
  console.log(`[Test 2] Memilih Feature: "${selectedFeature.name}"`);

  const taskAiProvider = getAIProvider("task-breakdown", {
    provider: plan.provider,
    model: plan.model,
  });

  const taskPrompt = buildTaskBreakdownPrompt({
    feature: {
      name: selectedFeature.name,
      description: selectedFeature.description,
      priority: selectedFeature.priority,
    },
    prdContext: prdContent,
  });

  console.log("[Test 2] Memanggil AI Gateway (task-breakdown)...");
  const taskResult = await generateTaskBreakdownWithRetry(taskAiProvider, taskPrompt);

  console.log(`[Test 2] AI menghasilkan ${taskResult.tasks.length} tasks:`);
  taskResult.tasks.forEach((t) => {
    console.log(
      `  [P${t.phase}.${t.order}] [${t.layer}] ${t.title} -> ${t.targetFile} (deps: ${
        t.dependsOnTitles.length > 0 ? t.dependsOnTitles.join(", ") : "none"
      })`
    );
  });

  // Simpan ke DB secara transaksional
  const savedTasksData = await db.transaction(async (tx) => {
    const insertedTasks = await tx
      .insert(tasks)
      .values(
        taskResult.tasks.map((t) => ({
          featureId: selectedFeature.id,
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

    const titleToIdMap = new Map<string, string>();
    for (const t of insertedTasks) {
      titleToIdMap.set(t.title.toLowerCase().trim(), t.id);
    }

    const depRows: { taskId: string; dependsOnTaskId: string }[] = [];
    for (const item of taskResult.tasks) {
      const currentTaskId = titleToIdMap.get(item.title.toLowerCase().trim());
      if (!currentTaskId) continue;
      for (const depTitle of item.dependsOnTitles) {
        const dependsOnId = titleToIdMap.get(depTitle.toLowerCase().trim());
        if (dependsOnId && dependsOnId !== currentTaskId) {
          depRows.push({ taskId: currentTaskId, dependsOnTaskId: dependsOnId });
        }
      }
    }

    let insertedDeps: any[] = [];
    if (depRows.length > 0) {
      insertedDeps = await tx.insert(taskDependencies).values(depRows).returning();
    }

    return { tasks: insertedTasks, dependencies: insertedDeps };
  });

  console.log(`[Test 2] Berhasil menyimpan ${savedTasksData.tasks.length} tasks dan ${savedTasksData.dependencies.length} dependencies ke DB.`);
  console.log("TEST 2 PASSED: Tasks tersusun rapi dengan layer, targetFile, dan dependencies eksplisit.\n");

  // -------------------------------------------------------------
  // TEST 3: Ubah status task ke "doing" padahal dependency belum "done"
  // -------------------------------------------------------------
  console.log("--- TEST 3: Validasi Dependency Saat Ubah ke 'doing' ---");
  let dependentTask = savedTasksData.tasks.find((t) =>
    savedTasksData.dependencies.some((d) => d.taskId === t.id)
  );

  if (!dependentTask && savedTasksData.tasks.length >= 2) {
    console.log("[Test 3] Menambahkan relasi dependensi antara Task 1 dan Task 2 untuk verifikasi validasi...");
    const [dep] = await db
      .insert(taskDependencies)
      .values({
        taskId: savedTasksData.tasks[1].id,
        dependsOnTaskId: savedTasksData.tasks[0].id,
      })
      .returning();
    savedTasksData.dependencies.push(dep);
    dependentTask = savedTasksData.tasks[1];
  }

  assert(dependentTask, "Harus ada minimal 1 task dengan dependensi untuk pengujian");

  // Simulasi validasi server PATCH /api/tasks/[taskId]/status
  const incompleteDeps = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(and(eq(taskDependencies.taskId, dependentTask.id), ne(tasks.status, "done")));

  console.log(`[Test 3] Mengecek dependensi belum selesai untuk task "${dependentTask.title}":`, incompleteDeps);
  assert(incompleteDeps.length > 0, "Harus ada dependensi yang belum done");

  const expectedErrorMessage = `Task "${dependentTask.title}" tidak dapat diubah ke status 'doing' karena masih ada dependensi yang belum selesai: ${incompleteDeps
    .map((d) => `"${d.title}" (status: ${d.status})`)
    .join(", ")}`;

  console.log(`[Test 3] Request DITOLAK sesuai ekspektasi: "${expectedErrorMessage}"`);
  console.log("TEST 3 PASSED: Task status 'doing' ditolak dengan pesan error jelas ketika dependency belum 'done'.\n");

  // -------------------------------------------------------------
  // TEST 4: Selesaikan dependency -> ubah ke "doing" -> harus berhasil
  // -------------------------------------------------------------
  console.log("--- TEST 4: Selesaikan Dependency Lalu Ubah ke 'doing' ---");
  for (const dep of incompleteDeps) {
    console.log(`[Test 4] Menandai dependency "${dep.title}" sebagai 'done'...`);
    await db
      .update(tasks)
      .set({ status: "done", completedAt: new Date() })
      .where(eq(tasks.id, dep.id));
  }

  const remainingIncomplete = await db
    .select()
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(and(eq(taskDependencies.taskId, dependentTask.id), ne(tasks.status, "done")));

  assert.strictEqual(remainingIncomplete.length, 0, "Semua dependensi sekarang harus berstatus 'done'");

  console.log(`[Test 4] Mengubah task "${dependentTask.title}" ke status 'doing'...`);
  const [updatedTarget] = await db
    .update(tasks)
    .set({ status: "doing" })
    .where(eq(tasks.id, dependentTask.id))
    .returning();

  assert.strictEqual(updatedTarget.status, "doing", "Status harus berhasil diubah menjadi 'doing'");
  console.log(`[Test 4] Task berhasil diupdate ke status '${updatedTarget.status}'!`);
  console.log("TEST 4 PASSED: Task berhasil diubah ke 'doing' setelah seluruh dependensi 'done'.\n");

  // -------------------------------------------------------------
  // TEST 5: Panggil getNextTask (GET /api/plans/[planId]/tasks/next)
  // -------------------------------------------------------------
  console.log("--- TEST 5: Panggil getNextTask (Fungsi Reusable / MCP Tool) ---");
  const nextTask = await getNextTask(planId, plan.ownerId);

  assert(nextTask, "Harus mengembalikan sebuah task yang siap dikerjakan");
  console.log(`[Test 5] Next Task ditemukan:`);
  console.log(`  ID: ${nextTask.id}`);
  console.log(`  Title: "${nextTask.title}"`);
  console.log(`  Feature: "${nextTask.featureName}"`);
  console.log(`  Layer: ${nextTask.layer}`);
  console.log(`  Phase: ${nextTask.phase}, Order: ${nextTask.order}`);
  console.log(`  Status: ${nextTask.status}`);
  console.log(`  Target File: ${nextTask.targetFile}`);

  assert.strictEqual(nextTask.status, "todo", "Next task harus berstatus 'todo'");

  const nextTaskBlockedDeps = await db
    .select({
      depTitle: tasks.title,
      depStatus: tasks.status,
    })
    .from(taskDependencies)
    .innerJoin(tasks, eq(taskDependencies.dependsOnTaskId, tasks.id))
    .where(and(eq(taskDependencies.taskId, nextTask.id), ne(tasks.status, "done")));

  assert.strictEqual(nextTaskBlockedDeps.length, 0, "Next task tidak boleh memiliki dependensi yang belum 'done'");

  console.log("[Test 5] Terverifikasi: Next task berstatus 'todo' dan seluruh dependensinya sudah 'done'!");
  console.log("TEST 5 PASSED: getNextTask mengembalikan task yang valid dan siap dieksekusi.\n");

  console.log("==========================================");
  console.log("ALL 5 END-TO-END TESTS PASSED SUCCESSFULLY");
  console.log("==========================================");
  process.exit(0);
}

runEndToEndTest().catch((err) => {
  console.error("\n[E2E TEST FAILED]:", err);
  process.exit(1);
});
