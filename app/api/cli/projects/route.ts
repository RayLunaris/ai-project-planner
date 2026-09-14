import { NextResponse } from "next/server";
import { validateBearerToken } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(request: Request) {
  const userId = await validateBearerToken(request);

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized. Invalid or missing Personal Access Token." },
      { status: 401 }
    );
  }

  try {
    const userProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
      })
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.createdAt));

    return NextResponse.json({ projects: userProjects });
  } catch (error) {
    console.error("Error fetching CLI projects:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
