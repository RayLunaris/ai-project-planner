import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, messages } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";

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
      return NextResponse.json(
        { error: "Plan ID wajib diisi" },
        { status: 400 }
      );
    }

    // Verify user owns the project containing this plan
    const [userPlan] = await db
      .select({
        planId: plans.id,
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

    // Retrieve all messages for the plan ordered by order ASC
    const planMessages = await db
      .select({
        id: messages.id,
        planId: messages.planId,
        role: messages.role,
        content: messages.content,
        options: messages.options,
        selectedOptionId: messages.selectedOptionId,
        order: messages.order,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.planId, planId))
      .orderBy(asc(messages.order));

    return NextResponse.json(planMessages);
  } catch (error) {
    console.error("Error retrieving plan messages:", error);
    return NextResponse.json(
      { error: "Gagal memuat riwayat pesan" },
      { status: 500 }
    );
  }
}

const createMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().optional(),
    selectedOptionId: z.string().trim().nullable().optional(),
    selectedOptionLabel: z.string().trim().nullable().optional(),
    options: z
      .array(
        z.object({
          id: z.string().trim().min(1),
          label: z.string().trim().min(1),
        })
      )
      .nullable()
      .optional(),
  })
  .refine(
    (data) => {
      if (data.role === "user") {
        return Boolean(
          data.content?.trim() ||
          data.selectedOptionId?.trim() ||
          data.selectedOptionLabel?.trim()
        );
      }
      return Boolean(data.content?.trim());
    },
    {
      message: "Konten pesan tidak boleh kosong",
      path: ["content"],
    }
  );

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await resolveUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json(
        { error: "Plan ID wajib diisi" },
        { status: 400 }
      );
    }

    // Verify user owns the project containing this plan
    const [userPlan] = await db
      .select({
        planId: plans.id,
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

    const body = await req.json();
    const parsed = createMessageSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload tidak valid", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { role, options, selectedOptionId, selectedOptionLabel } = parsed.data;
    let content = parsed.data.content || "";

    // For user message with selectedOptionId, ensure content is the human-readable option label
    if (role === "user" && selectedOptionId) {
      if (selectedOptionLabel?.trim()) {
        content = selectedOptionLabel.trim();
      } else {
        // If content is empty or equals the ID, look up option label from the last assistant message
        if (!content.trim() || content.trim() === selectedOptionId.trim()) {
          const [lastAssistantMsg] = await db
            .select({
              options: messages.options,
            })
            .from(messages)
            .where(and(eq(messages.planId, planId), eq(messages.role, "assistant")))
            .orderBy(desc(messages.order))
            .limit(1);

          if (lastAssistantMsg?.options && Array.isArray(lastAssistantMsg.options)) {
            const found = lastAssistantMsg.options.find(
              (opt: { id: string; label: string }) => opt.id === selectedOptionId
            );
            if (found?.label) {
              content = found.label;
            }
          }
        }
      }
      if (!content.trim()) {
        content = selectedOptionId;
      }
    }

    const [lastMsg] = await db
      .select({ order: messages.order })
      .from(messages)
      .where(eq(messages.planId, planId))
      .orderBy(desc(messages.order))
      .limit(1);

    const nextOrder = (lastMsg?.order ?? 0) + 1;

    const [newMessage] = await db
      .insert(messages)
      .values({
        planId,
        role,
        content: content.trim(),
        options: role === "assistant" ? options || null : null,
        selectedOptionId: role === "user" ? selectedOptionId || null : null,
        order: nextOrder,
      })
      .returning();

    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    console.error("Error creating plan message:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan pesan" },
      { status: 500 }
    );
  }
}
