import { NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";
import type { GeneratedImage, ImageQualityReviewInput } from "@/lib/types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function needsRerun(review: Awaited<ReturnType<ReturnType<typeof getImageQualityReviewRepository>["getLatestByImage"]>>): boolean {
  if (!review) return true;
  if (review.reviewStatus === "succeeded" && !review.qualityStatus) return true;
  if (review.reviewStatus === "failed" || review.reviewStatus === "timeout" || review.reviewStatus === "skipped") return true;
  return false;
}

export async function POST(request: Request) {
  try {
    if (!getRuntimeConfig().qualityReviewEnabled) {
      return NextResponse.json(
        fail("QUALITY_REVIEW_DISABLED", "AI quality review is disabled"),
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const imageIds = Array.isArray(body.imageIds)
      ? body.imageIds.map(Number).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, limit)
      : null;

    const generationRepository = getGenerationJobRepository();
    const qualityRepository = getImageQualityReviewRepository();
    const images = imageIds
      ? (await Promise.all(imageIds.map((id: number) => generationRepository.getGeneratedImage(id)))).filter(Boolean) as GeneratedImage[]
      : (await generationRepository.listGeneratedImages({ page: 1, pageSize: limit })).items;

    const submitted: number[] = [];
    const skipped: Array<{ imageId: number; reason: string }> = [];
    const failed: Array<{ imageId: number; error: string }> = [];

    for (const image of images) {
      const latestReview = await qualityRepository.getLatestByImage(image.id);
      if (!needsRerun(latestReview)) {
        skipped.push({ imageId: image.id, reason: "latest_review_is_complete" });
        continue;
      }

      const review = await qualityRepository.rerunReview(buildReviewInput(image));
      if (review) {
        submitted.push(image.id);
      } else {
        failed.push({ imageId: image.id, error: "failed_to_create_review" });
      }
    }

    return NextResponse.json(ok({
      submitted,
      skipped,
      failed,
      summary: {
        requested: images.length,
        submitted: submitted.length,
        skipped: skipped.length,
        failed: failed.length,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to rerun quality reviews"),
      { status: 500 }
    );
  }
}
