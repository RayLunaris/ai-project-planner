import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  plans,
  projects,
  clarificationSessions,
  clarificationAnswers,
  planVersions,
} from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import {
  PRD_GENERATION_SYSTEM_PROMPT,
  buildPrdGenerationPrompt,
  prdSchema,
  PrdContentJson,
} from "@/lib/prompts/prd-generation";
import { renderPrdToMarkdown } from "@/lib/markdown/renderer";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const maxDuration = 60;

function extractJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
  }
  return JSON.parse(text);
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { planId } = await params;

    // Verify user owns the project
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
        { error: "Sesi klarifikasi belum dimulai untuk plan ini" },
        { status: 400 }
      );
    }

    const answers = await db
      .select()
      .from(clarificationAnswers)
      .where(eq(clarificationAnswers.sessionId, clarificationSession.id))
      .orderBy(asc(clarificationAnswers.order));

    const prompt = buildPrdGenerationPrompt({
      initialIdea: clarificationSession.initialIdea,
      answers: answers.map((a) => ({
        question: a.question,
        answer: a.answer,
      })),
    });

    const aiProvider = getAIProvider("prd-generation");
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        let validatedPrd: PrdContentJson | null = null;
        let lastError: unknown = null;
        const maxAttempts = 3; // 1 initial + max 2 retries as per PRD section 9

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          let accumulatedRaw = "";

          try {
            if (attempt > 1) {
              sendEvent({
                type: "status",
                message: `Validasi JSON gagal, mencoba generasi ulang (percobaan ${attempt}/${maxAttempts})...`,
              });
            }

            const streamIterable = aiProvider.stream({
              system: PRD_GENERATION_SYSTEM_PROMPT,
              prompt:
                attempt === 1
                  ? prompt
                  : `${prompt}\n\nPERINGATAN: Pastikan respons Anda 100% JSON valid tanpa syntax error.`,
            });

            for await (const token of streamIterable) {
              accumulatedRaw += token;
              sendEvent({ type: "chunk", text: token });
            }

            const parsedObj = extractJson(accumulatedRaw);
            const validationResult = prdSchema.safeParse(parsedObj);

            if (validationResult.success) {
              validatedPrd = validationResult.data;
              break;
            } else {
              lastError = validationResult.error.issues;
            }
          } catch (err) {
            lastError = err;
          }
        }

        if (!validatedPrd) {
          sendEvent({
            type: "error",
            error: "Gagal menghasilkan PRD yang valid setelah beberapa percobaan.",
            details: lastError instanceof Error ? lastError.message : String(lastError),
          });
          controller.close();
          return;
        }

        try {
          // Determine next version number
          const existingVersions = await db
            .select({ versionNumber: planVersions.versionNumber })
            .from(planVersions)
            .where(eq(planVersions.planId, planId))
            .orderBy(desc(planVersions.versionNumber))
            .limit(1);

          const nextVersionNumber =
            (existingVersions[0]?.versionNumber ?? 0) + 1;

          const renderedMarkdown = renderPrdToMarkdown(validatedPrd);

          // Insert new plan_version
          const [newVersion] = await db
            .insert(planVersions)
            .values({
              planId,
              versionNumber: nextVersionNumber,
              contentJson: validatedPrd,
              contentMarkdown: renderedMarkdown,
              changeSummary: "Generasi PRD awal dari klarifikasi ide",
              createdBy: userId,
            })
            .returning();

          // Update plan currentVersionId and status
          await db
            .update(plans)
            .set({
              currentVersionId: newVersion.id,
              status: "generated",
            })
            .where(eq(plans.id, planId));

          sendEvent({
            type: "complete",
            versionId: newVersion.id,
            versionNumber: nextVersionNumber,
            markdown: renderedMarkdown,
            json: validatedPrd,
          });
        } catch (dbErr) {
          console.error("Database save error during PRD generation:", dbErr);
          sendEvent({
            type: "error",
            error: "PRD berhasil di-generate namun gagal disimpan ke database.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in generate route:", error);
    return NextResponse.json(
      { error: "Gagal memproses pembuatan PRD" },
      { status: 500 }
    );
  }
}
