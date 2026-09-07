import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { projects, plans } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileText,
  PlusCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { CreatePlanDialog } from "@/components/dashboard/create-plan-dialog";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectOverviewPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { projectId } = await params;

  // Fetch project
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

  // Fetch plans in this project
  const projectPlans = await db
    .select({
      id: plans.id,
      status: plans.status,
      currentVersionId: plans.currentVersionId,
      createdAt: plans.createdAt,
    })
    .from(plans)
    .where(eq(plans.projectId, projectId))
    .orderBy(desc(plans.createdAt));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <DashboardHeader user={session.user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Kembali ke Dashboard</span>
          </Link>
        </div>

        {/* Project Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-border/40">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{project.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {project.description || "Tidak ada deskripsi proyek."}
            </p>
          </div>
          <div className="shrink-0">
            <CreatePlanDialog projectId={project.id} />
          </div>
        </div>

        {/* Plans List */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Daftar Plan & PRD</h2>

          {projectPlans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-2 border-dashed border-border/80 rounded-2xl bg-card/40">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4">
                <FileText className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">Belum ada Plan PRD</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-5">
                Mulai dengan memasukkan ide awal aplikasi Anda untuk dipandu klarifikasi oleh AI.
              </p>
              <CreatePlanDialog
                projectId={project.id}
                triggerButton={
                  <Button className="gap-2 shadow-sm">
                    <PlusCircle className="h-4 w-4" />
                    <span>Buat Plan Baru</span>
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {projectPlans.map((plan, idx) => {
                const formattedDate = plan.createdAt
                  ? new Date(plan.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "-";

                return (
                  <Link
                    key={plan.id}
                    href={`/projects/${project.id}/plans/${plan.id}`}
                    className="group block"
                  >
                    <Card className="h-full border-border/60 hover:border-primary/50 transition-all duration-200 hover:shadow-md flex flex-col justify-between">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="capitalize text-xs">
                            {plan.status}
                          </Badge>
                          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <CardTitle className="text-base font-semibold mt-2 group-hover:text-primary transition-colors">
                          Plan #{projectPlans.length - idx}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                          {plan.status === "clarifying"
                            ? "Sedang dalam tahap klarifikasi ide"
                            : "PRD telah digenerate"}
                        </CardDescription>
                      </CardHeader>

                      <CardFooter className="pt-2 border-t border-border/40 text-xs text-muted-foreground flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{formattedDate}</span>
                        </div>
                        <span className="text-primary font-medium group-hover:underline">
                          Buka Plan &rarr;
                        </span>
                      </CardFooter>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
