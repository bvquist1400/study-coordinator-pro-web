import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, createSupabaseAdmin } from "@/lib/api/auth";
import logger from "@/lib/logger";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = await authenticateUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { error: auth.error ?? "Unauthorized" },
      { status: auth.status ?? 401 },
    );
  }

  try {
    const supabase = createSupabaseAdmin();
    const { error } = await supabase.from("study_coordinators").delete().eq("id", id);

    if (error) {
      logger.error("Failed to delete study coordinator assignment", error as any, {
        assignmentId: id,
      });
      return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Unexpected error deleting study assignment", error as any, {
      assignmentId: id,
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
