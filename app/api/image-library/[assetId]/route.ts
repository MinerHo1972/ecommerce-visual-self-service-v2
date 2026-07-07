import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getMysqlPool } from "@/lib/db/mysql";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";

function normalizeRating(value: unknown) {
  if (value === null || value === "") return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return undefined;
  return rating;
}

function parseTags(value: string | string[] | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return value.split(",").map((tag) => tag.trim()).filter(Boolean);
  }
}

function withRating(tags: string[], rating: number | null) {
  const next = tags.filter((tag) => !tag.startsWith("rating:"));
  if (rating) next.push(`rating:${rating}`);
  return next;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;
    const [source, rawId] = assetId.split(":");
    const id = Number(rawId);
    if (!source || !Number.isInteger(id)) {
      return NextResponse.json(fail("VALIDATION_ERROR", "assetId must be source:id"), { status: 400 });
    }

    const body = await request.json() as { rating?: unknown };
    if (!("rating" in body)) {
      return NextResponse.json(fail("VALIDATION_ERROR", "rating is required"), { status: 400 });
    }
    const rating = normalizeRating(body.rating);
    if (rating === undefined) {
      return NextResponse.json(fail("VALIDATION_ERROR", "rating must be an integer from 1 to 5, or empty"), { status: 400 });
    }

    if (source === "generated") {
      const image = await getGenerationJobRepository().updateGeneratedImageRating(id, rating);
      if (!image) return NextResponse.json(fail("NOT_FOUND", "图片不存在"), { status: 404 });
      return NextResponse.json(ok({ image }));
    }

    const table = source === "product" ? "product_library" : source === "template" ? "template_library" : null;
    if (!table) {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported source"), { status: 400 });
    }

    const pool = await getMysqlPool();
    const [rows] = await pool.query<Array<{ tags: string | string[] | null }>>(
      `SELECT tags FROM ${table} WHERE id = :id AND status = 'active' LIMIT 1`,
      { id }
    );
    const row = rows[0];
    if (!row) return NextResponse.json(fail("NOT_FOUND", "图片不存在"), { status: 404 });

    const tags = withRating(parseTags(row.tags), rating);
    await pool.execute(`UPDATE ${table} SET tags = :tags WHERE id = :id`, { id, tags: JSON.stringify(tags) });
    return NextResponse.json(ok({ tags }));
  } catch (err) {
    return NextResponse.json(
      fail("INTERNAL_ERROR", err instanceof Error ? err.message : "更新图库失败"),
      { status: 500 }
    );
  }
}
