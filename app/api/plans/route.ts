import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, clarificationSessions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

const createPlanSchema = z.object({
  projectId: z.string().uuid("ID Project tidak valid"),
  initialIdea: z.string().trim().min(5, "Ide awal minimal 5 karakter"),
});

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (projectId) {
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
        return NextResponse.json(
          { error: "Project tidak ditemukan atau akses ditolak" },
          { status: 404 }
        );
      }

      const projectPlans = await db
        .select()
        .from(plans)
        .where(eq(plans.projectId, projectId))
        .orderBy(desc(plans.createdAt));

      return NextResponse.json({ plans: projectPlans });
    }

    // If no projectId, return all plans across all user projects
    const userProjects = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.ownerId, session.user.id));

    if (userProjects.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    const allPlans = await db
      .select()
      .from(plans)
      .orderBy(desc(plans.createdAt));

    const userProjectIds = new Set(userProjects.map((p) => p.id));
    const filteredPlans = allPlans.filter((p) => userProjectIds.has(p.projectId));

    return NextResponse.json({ plans: filteredPlans });
  } catch (error) {
    console.error("Error fetching plans:", error);
    return NextResponse.json(
      { error: "Gagal mengambil daftar plans" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const result = createPlanSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    const { projectId, initialIdea } = result.data;

    // Verify user owns the project
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
      return NextResponse.json(
        { error: "Project tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    // Create plan with initial status "clarifying"
    const [newPlan] = await db
      .insert(plans)
      .values({
        projectId,
        status: "clarifying",
      })
      .returning();

    // Create clarification session with initialIdea
    const [clarificationSession] = await db
      .insert(clarificationSessions)
      .values({
        planId: newPlan.id,
        initialIdea,
      })
      .returning();

    return NextResponse.json(
      {
        plan: newPlan,
        clarificationSession,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating plan:", error);
    return NextResponse.json(
      { error: "Gagal membuat plan baru" },
      { status: 500 }
    );
  }
}
