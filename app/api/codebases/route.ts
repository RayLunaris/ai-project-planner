import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { codebases, projects } from "@/lib/db/schema";
import { validateBearerToken } from "@/lib/api-auth";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    // 1. Validasi token dari header
    const userId = await validateBearerToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse body
    const body = await req.json();
    const { projectId, rootPath, framework, syncMode } = body;

    if (!projectId || !rootPath) {
      return NextResponse.json(
        { error: "Missing required fields (projectId, rootPath)" },
        { status: 400 }
      );
    }

    // 3. Pastikan user memiliki project ini
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    });

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or you do not have permission" },
        { status: 404 }
      );
    }

    // 4. Periksa apakah codebase dengan path yang sama sudah ada di project ini
    const existingCodebase = await db.query.codebases.findFirst({
      where: and(eq(codebases.projectId, projectId), eq(codebases.rootPath, rootPath)),
    });

    if (existingCodebase) {
      return NextResponse.json({
        message: "Codebase already exists",
        codebase: existingCodebase,
      });
    }

    // 5. Buat codebase baru
    const [newCodebase] = await db
      .insert(codebases)
      .values({
        projectId,
        rootPath,
        framework: framework || null,
        syncMode: syncMode || "basic",
      })
      .returning();

    return NextResponse.json({
      message: "Codebase registered successfully",
      codebase: newCodebase,
    }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/codebases Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to register codebase" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await validateBearerToken(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, userId)),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const projectCodebases = await db.query.codebases.findMany({
      where: eq(codebases.projectId, projectId),
    });

    return NextResponse.json({ codebases: projectCodebases });
  } catch (error: any) {
    console.error("GET /api/codebases Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch codebases" },
      { status: 500 }
    );
  }
}
