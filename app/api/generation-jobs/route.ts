import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { templateId, templateName, inputs, exportSize, candidateCount } = body;

    if (!templateId || !templateName) {
      return NextResponse.json(fail("VALIDATION_ERROR", "templateId and templateName are required"), { status: 400 });
    }

    const normalizedCandidateCount = Math.min(4, Math.max(1, Number(candidateCount) || 4));

    const result = await getGenerationJobRepository().createJob({
      templateId,
      templateName,
      inputs: inputs ?? {},
      exportSize,
      candidateCount: normalizedCandidateCount,
    });

    return NextResponse.json(ok(result));
  } catch (error) {
    return NextResponse.json(fail("INTERNAL_ERROR", `Failed to create generation job: ${error}`), { status: 500 });
  }
}
