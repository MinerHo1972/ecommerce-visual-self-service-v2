import { NextRequest, NextResponse } from "next/server";
import { ok, fail } from "@/lib/api-response";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

function normalizeFeedback(value: string) {
  const feedback = value.trim().replace(/^feedback:/i, "").replace(/[<>]/g, "").slice(0, 24).trim();
  return feedback || null;
}

function normalizeRating(value: unknown) {
  if (value === null || value === "") return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return undefined;
  return rating;
}

function normalizeUsage(value: unknown) {
  if (value !== "product" && value !== "template") return null;
  return value;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (isNaN(id)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a number"),
        { status: 400 }
      );
    }

    const image = await getGenerationJobRepository().getGeneratedImage(id);

    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to get generated image"),
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (isNaN(id)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a number"),
        { status: 400 }
      );
    }

    let body: { selected?: unknown; feedback?: unknown; rating?: unknown; usage?: unknown; enabled?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "Invalid JSON body"),
        { status: 400 }
      );
    }

    let image;
    if (typeof body.selected === "boolean") {
      image = await getGenerationJobRepository().updateGeneratedImageSelection(id, body.selected);
    } else if ("rating" in body) {
      const rating = normalizeRating(body.rating);
      if (rating === undefined) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "rating must be an integer from 1 to 5, or empty"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageRating(id, rating);
    } else if ("usage" in body) {
      const usage = normalizeUsage(body.usage);
      if (!usage || typeof body.enabled !== "boolean") {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "usage must be product/template and enabled must be boolean"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageUsage(id, usage, body.enabled);
    } else if (typeof body.feedback === "string" && body.feedback.trim()) {
      const feedback = normalizeFeedback(body.feedback);
      if (!feedback) {
        return NextResponse.json(
          fail("VALIDATION_ERROR", "feedback must be a non-empty string"),
          { status: 400 }
        );
      }
      image = await getGenerationJobRepository().updateGeneratedImageFeedback(id, feedback);
    } else {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "selected, rating, usage, or feedback is required"),
        { status: 400 }
      );
    }

    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to update image selection"),
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ imageId: string }> }
) {
  try {
    const { imageId } = await params;
    const id = Number(imageId);

    if (isNaN(id)) {
      return NextResponse.json(
        fail("VALIDATION_ERROR", "imageId must be a number"),
        { status: 400 }
      );
    }

    const image = await getGenerationJobRepository().archiveGeneratedImage(id);

    if (!image) {
      return NextResponse.json(
        fail("NOT_FOUND", `Generated image ${imageId} not found`),
        { status: 404 }
      );
    }

    return NextResponse.json(ok({ image }));
  } catch (error) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", error instanceof Error ? error.message : "Failed to move generated image to recycle bin"),
      { status: 500 }
    );
  }
}
