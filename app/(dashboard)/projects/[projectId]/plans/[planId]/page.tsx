import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  projects,
  plans,
  clarificationSessions,
  clarificationAnswers,
  planVersions,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PlanBuilderContainer } from "@/components/plan-builder/plan-builder-container";

interface PageProps {
  params: Promise<{ projectId: string; planId: string }>;
}

export default async function PlanBuilderPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { projectId, planId } = await params;

  // Verify project ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.ownerId, session.user.id)
      )
    )
    .limit(1);

  if (!project) {
    notFound();
  }

  // Fetch plan
  const [plan] = await db
    .select()
    .from(plans)
    .where(
      and(
        eq(plans.id, planId),
        eq(plans.projectId, projectId)
      )
    )
    .limit(1);

  if (!plan) {
    notFound();
  }

  // Fetch clarification session
  const [sessionRecord] = await db
    .select()
    .from(clarificationSessions)
    .where(eq(clarificationSessions.planId, planId))
    .limit(1);

  const initialIdea = sessionRecord?.initialIdea || "Belum ada ide awal tercatat.";

  // Fetch answers
  const answers = sessionRecord
    ? await db
        .select({
          id: clarificationAnswers.id,
          question: clarificationAnswers.question,
          answer: clarificationAnswers.answer,
          order: clarificationAnswers.order,
        })
        .from(clarificationAnswers)
        .where(eq(clarificationAnswers.sessionId, sessionRecord.id))
        .orderBy(asc(clarificationAnswers.order))
    : [];

  // Fetch current version if exists
  let currentVersion = null;
  if (plan.currentVersionId) {
    const [version] = await db
      .select({
        id: planVersions.id,
        versionNumber: planVersions.versionNumber,
        contentMarkdown: planVersions.contentMarkdown,
        changeSummary: planVersions.changeSummary,
        createdAt: planVersions.createdAt,
      })
      .from(planVersions)
      .where(eq(planVersions.id, plan.currentVersionId))
      .limit(1);

    if (version) {
      currentVersion = version;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <DashboardHeader user={session.user} />
      <main className="flex-1 overflow-hidden">
        <PlanBuilderContainer
          projectId={project.id}
          projectName={project.name}
          planId={plan.id}
          initialStatus={plan.status || "clarifying"}
          initialIdea={initialIdea}
          initialAnswers={answers}
          initialVersion={currentVersion}
        />
      </main>
    </div>
  );
}
