import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans, projects, planVersions } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getAIProvider } from "@/lib/ai/gateway";
import {
  PRD_REVISION_SYSTEM_PROMPT,
  buildPrdRevisionPrompt,
  prdSchema,
  PrdContentJson,
} from "@/lib/prompts/prd-generation";
import { renderPrdToMarkdown } from "@/lib/markdown/renderer";
import { extractJson } from "@/lib/utils";

interface RouteParams {
  params: Promise<{ planId: string }>;
}

export const maxDuration = 60;


export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { planId } = await params;
    if (!planId) {
      return NextResponse.json({ error: "Plan ID wajib diisi" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const instruction =
      typeof body.revisionInstruction === "string"
        ? body.revisionInstruction.trim()
        : typeof body.instruction === "string"
        ? body.instruction.trim()
        : typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!instruction) {
      return NextResponse.json(
        { error: "Instruksi revisi wajib diisi" },
        { status: 400 }
      );
    }

    // Verify user owns the project and plan
    const [userPlan] = await db
      .select({
        planId: plans.id,
        status: plans.status,
        currentVersionId: plans.currentVersionId,
        projectId: plans.projectId,
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

    // Fetch the base version to revise
    let baseVersion = null;
    if (userPlan.currentVersionId) {
      const [version] = await db
        .select()
        .from(planVersions)
        .where(
          and(
            eq(planVersions.id, userPlan.currentVersionId),
            eq(planVersions.planId, planId)
          )
        )
        .limit(1);
      baseVersion = version;
    }

    if (!baseVersion) {
      const [latestVersion] = await db
        .select()
        .from(planVersions)
        .where(eq(planVersions.planId, planId))
        .orderBy(desc(planVersions.versionNumber))
        .limit(1);
      baseVersion = latestVersion;
    }

    if (!baseVersion || !baseVersion.contentJson) {
      return NextResponse.json(
        {
          error:
            "Belum ada versi PRD yang dapat direvisi. Silakan generate PRD terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const basePrdJson = baseVersion.contentJson as PrdContentJson;
    const aiProvider = getAIProvider("prd-revision");
    const isStreamRequest = req.headers.get("accept")?.includes("text/event-stream");

    // SSE Streaming response flow
    if (isStreamRequest) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const sendEvent = (data: Record<string, unknown>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          };

          let validatedPrd: PrdContentJson | null = null;
          let parsedChangeSummary: string | null = null;
          let lastError: unknown = null;
          const maxAttempts = 3;

          for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            let accumulatedRaw = "";

            try {
              if (attempt > 1) {
                sendEvent({
                  type: "status",
                  message: `Validasi JSON gagal, mencoba generasi ulang revisi (percobaan ${attempt}/${maxAttempts})...`,
                });
              }

              const prompt =
                attempt === 1
                  ? buildPrdRevisionPrompt({
                      currentPrdJson: basePrdJson,
                      revisionInstruction: instruction,
                    })
                  : `${buildPrdRevisionPrompt({
                      currentPrdJson: basePrdJson,
                      revisionInstruction: instruction,
                    })}\n\nPERINGATAN: Pastikan respons Anda 100% objek JSON valid tanpa syntax error.`;

              const streamIterable = aiProvider.stream({
                system: PRD_REVISION_SYSTEM_PROMPT,
                prompt,
              });

              for await (const token of streamIterable) {
                accumulatedRaw += token;
                sendEvent({ type: "chunk", text: token });
              }

              const parsedObj = extractJson(accumulatedRaw) as Record<string, unknown>;
              const validationResult = prdSchema.safeParse(parsedObj);

              if (validationResult.success) {
                validatedPrd = validationResult.data;
                if (typeof parsedObj.changeSummary === "string" && parsedObj.changeSummary.trim()) {
                  parsedChangeSummary = parsedObj.changeSummary.trim();
                }
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
              error: "Gagal menghasilkan revisi PRD yang valid setelah beberapa percobaan.",
              details:
                lastError instanceof Error ? lastError.message : String(lastError),
            });
            controller.close();
            return;
          }

          try {
            const existingVersions = await db
              .select({ versionNumber: planVersions.versionNumber })
              .from(planVersions)
              .where(eq(planVersions.planId, planId))
              .orderBy(desc(planVersions.versionNumber))
              .limit(1);

            const nextVersionNumber =
              (existingVersions[0]?.versionNumber ?? 0) + 1;

            const renderedMarkdown = renderPrdToMarkdown(validatedPrd);
            const finalChangeSummary =
              validatedPrd.changeSummary?.trim() ||
              parsedChangeSummary ||
              instruction;

            const [newVersion] = await db
              .insert(planVersions)
              .values({
                planId,
                versionNumber: nextVersionNumber,
                contentJson: validatedPrd,
                contentMarkdown: renderedMarkdown,
                changeSummary: finalChangeSummary,
                createdBy: userId,
              })
              .returning();

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
              changeSummary: finalChangeSummary,
            });
          } catch (dbErr) {
            console.error("Database save error during PRD revision:", dbErr);
            sendEvent({
              type: "error",
              error: "Revisi PRD berhasil diproses namun gagal disimpan ke database.",
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
    }

    // Standard JSON response flow
    let validatedPrd: PrdContentJson | null = null;
    let parsedChangeSummary: string | null = null;
    let lastError: unknown = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const prompt =
          attempt === 1
            ? buildPrdRevisionPrompt({
                currentPrdJson: basePrdJson,
                revisionInstruction: instruction,
              })
            : `${buildPrdRevisionPrompt({
                currentPrdJson: basePrdJson,
                revisionInstruction: instruction,
              })}\n\nPERINGATAN: Pastikan respons Anda 100% objek JSON valid tanpa syntax error.`;

        const rawResponse = await aiProvider.generate({
          system: PRD_REVISION_SYSTEM_PROMPT,
          prompt,
          jsonMode: true,
        });

        const parsedObj = extractJson(rawResponse) as Record<string, unknown>;
        const validationResult = prdSchema.safeParse(parsedObj);

        if (validationResult.success) {
          validatedPrd = validationResult.data;
          if (typeof parsedObj.changeSummary === "string" && parsedObj.changeSummary.trim()) {
            parsedChangeSummary = parsedObj.changeSummary.trim();
          }
          break;
        } else {
          lastError = validationResult.error.issues;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!validatedPrd) {
      return NextResponse.json(
        {
          error: "Gagal menghasilkan revisi PRD yang valid setelah beberapa percobaan.",
          details:
            lastError instanceof Error ? lastError.message : String(lastError),
        },
        { status: 500 }
      );
    }

    const existingVersions = await db
      .select({ versionNumber: planVersions.versionNumber })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;
    const renderedMarkdown = renderPrdToMarkdown(validatedPrd);
    const finalChangeSummary =
      validatedPrd.changeSummary?.trim() || parsedChangeSummary || instruction;

    const [newVersion] = await db
      .insert(planVersions)
      .values({
        planId,
        versionNumber: nextVersionNumber,
        contentJson: validatedPrd,
        contentMarkdown: renderedMarkdown,
        changeSummary: finalChangeSummary,
        createdBy: userId,
      })
      .returning();

    await db
      .update(plans)
      .set({
        currentVersionId: newVersion.id,
        status: "generated",
      })
      .where(eq(plans.id, planId));

    return NextResponse.json(
      {
        success: true,
        versionId: newVersion.id,
        versionNumber: newVersion.versionNumber,
        markdown: renderedMarkdown,
        json: validatedPrd,
        changeSummary: finalChangeSummary,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in revise route:", error);
    return NextResponse.json(
      { error: "Gagal memproses revisi PRD" },
      { status: 500 }
    );
  }
}
