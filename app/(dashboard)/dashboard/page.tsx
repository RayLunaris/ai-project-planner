import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, plans } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ProjectGrid } from "@/components/dashboard/project-grid";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";

export const metadata = {
  title: "Dashboard — AI Project Planner",
  description: "Daftar project dan dokumen PRD aplikasi Anda",
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Fetch projects with plan count
  const userProjects = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      createdAt: projects.createdAt,
      planCount: sql<number>`cast(count(${plans.id}) as int)`,
    })
    .from(projects)
    .leftJoin(plans, eq(plans.projectId, projects.id))
    .where(eq(projects.ownerId, session.user.id))
    .groupBy(projects.id)
    .orderBy(desc(projects.createdAt));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <DashboardHeader user={session.user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Project Saya</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kelola ide arsitektur aplikasi dan dokumen PRD yang telah digenerate.
            </p>
          </div>
          <div className="shrink-0">
            <CreateProjectDialog />
          </div>
        </div>

        <ProjectGrid projects={userProjects} />
      </main>
    </div>
  );
}
