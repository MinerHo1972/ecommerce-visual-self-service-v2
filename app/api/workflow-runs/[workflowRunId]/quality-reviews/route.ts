import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowRunId: string }> }
) {
  try {
    const { workflowRunId } = await params;
    const normalizedWorkflowRunId = decodeURIComponent(workflowRunId).trim();

    if (!normalizedWorkflowRunId) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "workflowRunId is required"),
        { status: 400 }
      );
    }

    const qualityReviews = await getImageQualityReviewRepository().listByWorkflowRun(normalizedWorkflowRunId);

    return NextResponse.json(ok({
      workflowRunId: normalizedWorkflowRunId,
      qualityReviews,
      summary: {
        count: qualityReviews.length,
        statuses: qualityReviews.reduce<Record<string, number>>((acc, review) => {
          acc[review.reviewStatus] = (acc[review.reviewStatus] ?? 0) + 1;
          return acc;
        }, {}),
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to list workflow quality reviews"),
      { status: 500 }
    );
  }
}
