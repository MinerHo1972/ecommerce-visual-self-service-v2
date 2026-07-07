import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";
import type { GeneratedImage, ImageQualityReviewInput } from "@/lib/types";

async function getImageFromParams(params: Promise<{ imageId: string }>) {
  const { imageId } = await params;
  const id = Number(imageId);

  if (!Number.isInteger(id) || id <= 0) {
    return {
      error: NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a positive number"),
        { status: 400 }
      ),
    };
  }

  const image = await getGenerationJobRepository().getGeneratedImage(id);
  if (!image) {
    return {
      error: NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      ),
    };
  }

  return { id, image };
}

function buildReviewInput(image: GeneratedImage): ImageQualityReviewInput {
  return {
    imageId: image.id,
    candidateImageUrl: image.thumbnailUrl,
    workflowRunId: image.workflowRunId ?? image.jobId,
    workflowType: image.workflowType ?? null,
    workflowStep: image.workflowStep ?? null,
    promptTrace: image.operationTrace ?? null,
    referenceImages: image.operationTrace?.referenceUrls ?? [],
    referenceImageHashes: image.operationTrace?.referenceImageHashes ?? [],
    constraintPreset: image.operationTrace?.constraintPreset ?? null,
    inputsSnapshot: image.inputsSnapshot,
    createdAt: new Date().toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    if (!getRuntimeConfig().qualityReviewEnabled) {
      return NextResponse.json(
        fail("QUALITY_REVIEW_DISABLED", "AI quality review is disabled"),
        { status: 409 }
      );
    }

    const result = await getImageFromParams(params);
    if (result.error) return result.error;

    const qualityReview = await getImageQualityReviewRepository().getLatestByImage(result.id);

    return NextResponse.json(ok({
      imageId: result.id,
      qualityReview,
      summary: {
        hasReview: Boolean(qualityReview),
        reviewStatus: qualityReview?.reviewStatus ?? null,
        qualityStatus: qualityReview?.qualityStatus ?? null,
        workflowRunId: qualityReview?.workflowRunId ?? result.image.workflowRunId ?? null,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get image quality review"),
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    if (!getRuntimeConfig().qualityReviewEnabled) {
      return NextResponse.json(
        fail("QUALITY_REVIEW_DISABLED", "AI quality review is disabled"),
        { status: 409 }
      );
    }

    const result = await getImageFromParams(params);
    if (result.error) return result.error;

    const qualityReview = await getImageQualityReviewRepository().rerunReview(buildReviewInput(result.image));
    if (!qualityReview) {
      return NextResponse.json(
        fail("QUALITY_REVIEW_UNAVAILABLE", "Failed to create quality review rerun"),
        { status: 503 }
      );
    }

    return NextResponse.json(ok({
      imageId: result.id,
      qualityReview,
      summary: {
        reviewStatus: qualityReview.reviewStatus,
        qualityStatus: qualityReview.qualityStatus ?? null,
        workflowRunId: qualityReview.workflowRunId ?? result.image.workflowRunId ?? null,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to rerun image quality review"),
      { status: 500 }
    );
  }
}
