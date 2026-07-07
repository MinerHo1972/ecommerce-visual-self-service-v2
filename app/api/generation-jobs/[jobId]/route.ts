import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const result = await getGenerationJobRepository().getJob(jobId);

  if (!result) {
    return NextResponse.json(fail("NOT_FOUND", `Generation job ${jobId} not found`), { status: 404 });
  }

  return NextResponse.json(ok(result));
}
