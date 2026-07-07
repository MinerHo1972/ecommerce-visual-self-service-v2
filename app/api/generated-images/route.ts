import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import { getImageQualityReviewRepository } from "@/lib/repositories/image-quality-reviews";
import { getRuntimeConfig } from "@/lib/config";
import type { QualityBadge } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const selected = searchParams.get("selected");
    const result = await getGenerationJobRepository().listGeneratedImages({
      keyword: searchParams.get("keyword") ?? undefined,
      templateId: searchParams.get("template_id") ? Number(searchParams.get("template_id")) : undefined,
      status: searchParams.get("status") ?? undefined,
      selected: selected === null ? undefined : selected === "true",
      page: Number(searchParams.get("page") ?? 1),
      pageSize: Number(searchParams.get("page_size") ?? 20)
    });

    const qualityReviewEnabled = getRuntimeConfig().qualityReviewEnabled;
    const imageIds = qualityReviewEnabled ? result.items.map((img) => img.id) : [];
    const qualityMap = qualityReviewEnabled ? await getImageQualityReviewRepository().getLatestByImageIds(imageIds) : new Map();
    const itemsWithQuality = result.items.map((img) => {
      const review = qualityMap.get(img.id);
      const qualityBadge: QualityBadge | null = review
        ? {
            reviewStatus: review.reviewStatus,
            qualityStatus: review.qualityStatus,
            confidence: review.confidence,
            suggestedAction: review.suggestedAction,
            reviewSource: review.reviewSource,
          }
        : null;
      return { ...img, qualityBadge };
    });

    return NextResponse.json(ok({ ...result, qualityReviewEnabled, items: itemsWithQuality }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to list generated images"),
      { status: 500 }
    );
  }
}


export async function DELETE(request: NextRequest) {
  try {
    let body: { imageIds?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid JSON body"),
        { status: 400 }
      );
    }

    if (!Array.isArray(body.imageIds)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageIds array is required"),
        { status: 400 }
      );
    }

    const imageIds = Array.from(new Set(body.imageIds.map(Number))).filter((id) => Number.isInteger(id) && id > 0);
    if (imageIds.length === 0) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageIds must contain valid numeric ids"),
        { status: 400 }
      );
    }

    const result = await getGenerationJobRepository().archiveGeneratedImages(imageIds);
    console.info("[generated-images] batch archive", {
      requested: imageIds.length,
      requestedIds: imageIds,
      archived: result.archivedIds.length,
      archivedIds: result.archivedIds,
      notFound: result.notFoundIds.length,
      notFoundIds: result.notFoundIds,
    });
    return NextResponse.json(ok({ requestedIds: imageIds, ...result }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to move generated images to recycle bin"),
      { status: 500 }
    );
  }
}
