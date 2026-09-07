import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, clarificationSessions, clarificationAnswers } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import { CLARIFICATION_SYSTEM_PROMPT, buildClarificationPrompt } from "@/lib/prompts/clarification";

const clarifyInputSchema = z.object({
  question: z.string().trim().optional(),
  answer: z.string().trim().optional(),
});

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;

    // Verify user owns the project containing this plan
    const [userPlan] = await db
      .select({
        planId: plans.id,
        status: plans.status,
        projectId: plans.projectId,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, session.user.id)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    const [clarificationSession] = await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.planId, planId))
      .limit(1);

    if (!clarificationSession) {
      return NextResponse.json(
        { error: "Sesi klarifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    const answers = await db
      .select()
      .from(clarificationAnswers)
      .where(eq(clarificationAnswers.sessionId, clarificationSession.id))
      .orderBy(asc(clarificationAnswers.order));

    return NextResponse.json({
      planId,
      status: userPlan.status,
      initialIdea: clarificationSession.initialIdea,
      answers,
    });
  } catch (error) {
    console.error("Error retrieving clarification session:", error);
    return NextResponse.json(
      { error: "Gagal memuat sesi klarifikasi" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await params;

    // Verify user owns the project containing this plan
    const [userPlan] = await db
      .select({
        planId: plans.id,
        status: plans.status,
        projectId: plans.projectId,
      })
      .from(plans)
      .innerJoin(projects, eq(plans.projectId, projects.id))
      .where(and(eq(plans.id, planId), eq(projects.ownerId, session.user.id)))
      .limit(1);

    if (!userPlan) {
      return NextResponse.json(
        { error: "Plan tidak ditemukan atau akses ditolak" },
        { status: 404 }
      );
    }

    const [clarificationSession] = await db
      .select()
      .from(clarificationSessions)
      .where(eq(clarificationSessions.planId, planId))
      .limit(1);

    if (!clarificationSession) {
      return NextResponse.json(
        { error: "Sesi klarifikasi tidak ditemukan" },
        { status: 404 }
      );
    }

    // Parse body if present
    let questionText = "";
    let answerText = "";

    try {
      const body = await req.json();
      const parsed = clarifyInputSchema.safeParse(body);
      if (parsed.success) {
        questionText = parsed.data.question || "";
        answerText = parsed.data.answer || "";
      }
    } catch {
      // Empty or non-JSON body is valid for initial prompt request
    }

    // If both question and answer are provided, persist them
    if (questionText && answerText) {
      const existingAnswers = await db
        .select()
        .from(clarificationAnswers)
        .where(eq(clarificationAnswers.sessionId, clarificationSession.id));

      const nextOrder = existingAnswers.length + 1;
      await db.insert(clarificationAnswers).values({
        sessionId: clarificationSession.id,
        question: questionText,
        answer: answerText,
        order: nextOrder,
      });
    }

    // Retrieve all answers in sequence
    const allAnswers = await db
      .select()
      .from(clarificationAnswers)
      .where(eq(clarificationAnswers.sessionId, clarificationSession.id))
      .orderBy(asc(clarificationAnswers.order));

    // Build clarification prompt
    const prompt = buildClarificationPrompt({
      initialIdea: clarificationSession.initialIdea,
      answers: allAnswers.map((a) => ({
        question: a.question,
        answer: a.answer,
      })),
    });

    const aiProvider = getAIProvider("clarification");
    const streamIterable = aiProvider.stream({
      system: CLARIFICATION_SYSTEM_PROMPT,
      prompt,
    });

    // Stream response using ReadableStream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamIterable) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          console.error("Streaming error in clarification route:", err);
          controller.error(err);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    console.error("Error in clarification route:", error);
    return NextResponse.json(
      { error: "Gagal memproses klarifikasi" },
      { status: 500 }
    );
  }
}
