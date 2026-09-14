import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const updatePlanSchema = z.object({
  selectedProvider: z.enum(["openrouter", "gemini"]).optional(),
  selectedModel: z.string().nullable().optional(),
  status: z.enum(["draft", "clarifying", "generated", "finalized"]).optional(),
});

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json({ error: "Plan ID wajib diisi" }, { status: 400 });
    }

    const [userPlan] = await db
      .select({
        id: plans.id,
        projectId: plans.projectId,
        status: plans.status,
        selectedProvider: plans.selectedProvider,
        selectedModel: plans.selectedModel,
        currentVersionId: plans.currentVersionId,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    return NextResponse.json({ plan: userPlan });
  } catch (error) {
    console.error("Error fetching plan:", error);
    return NextResponse.json(
      { error: "Gagal mengambil data plan" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json({ error: "Plan ID wajib diisi" }, { status: 400 });
    }

    const body = await req.json();
    const result = updatePlanSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || "Input tidak valid" },
        { status: 400 }
      );
    }

    // Verify ownership via project
    const [userPlan] = await db
      .select({
        id: plans.id,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, userId)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    const updateData: {
      selectedProvider?: "openrouter" | "gemini";
      selectedModel?: string | null;
      status?: "draft" | "clarifying" | "generated" | "finalized";
    } = {};

    if (result.data.selectedProvider !== undefined) {
      updateData.selectedProvider = result.data.selectedProvider;
    }
    if (result.data.selectedModel !== undefined) {
      updateData.selectedModel = result.data.selectedModel;
    }
    if (result.data.status !== undefined) {
      updateData.status = result.data.status;
    }

    const [updatedPlan] = await db
      .update(plans)
      .set(updateData)
      .where(eq(plans.id, planId))
      .returning();

    return NextResponse.json({ plan: updatedPlan });
  } catch (error) {
    console.error("Error updating plan:", error);
    return NextResponse.json(
      { error: "Gagal memperbarui plan" },
      { status: 500 }
    );
  }
}
