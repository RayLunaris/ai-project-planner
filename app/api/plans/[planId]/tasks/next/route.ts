import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getNextTask } from "@/lib/tasks/get-next-task";

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

    const task = await getNextTask(planId, userId);

    return NextResponse.json({
      success: true,
      task,
    });
  } catch (error) {
    console.error("Error fetching next task:", error);
    return NextResponse.json(
      { error: "Gagal mengambil task berikutnya" },
      { status: 500 }
    );
  }
}
