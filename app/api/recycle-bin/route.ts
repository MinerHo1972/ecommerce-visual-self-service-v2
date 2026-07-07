import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getMysqlPool } from "@/lib/db/mysql";

function toHttpsUrl(url: string): string {
  return url.replace(/^http:\/\//, "https://");
}

function getAliOssClient() {
  const config = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    authorization: "signature",
  });
}

type LibraryType = "product" | "template" | "generated";

type LibraryRow = {
  id: number;
  name: string;
  tags: string | string[] | null;
  oss_key: string;
  thumbnail_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

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

function freshUrl(client: ReturnType<typeof getAliOssClient> | null, ossKey: string, storedUrl: string, type: LibraryType) {
  if (!ossKey && !storedUrl) return "";
  let thumbnailUrl = storedUrl ? toHttpsUrl(storedUrl) : "";
  const storedUrlUsesOssKey = Boolean(ossKey && thumbnailUrl.includes(ossKey));
  if (client && ossKey && (type !== "generated" || !thumbnailUrl || storedUrlUsesOssKey)) {
    try {
      thumbnailUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
    } catch {
      // fall back to stored URL
    }
  }
  return thumbnailUrl;
}

function getPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

type RecycleRow = LibraryRow & { item_type: LibraryType };

function rowTime(row: { updated_at: string }) {
  return new Date(row.updated_at).getTime() || 0;
}

export async function GET(request: NextRequest) {
  try {
    const pool = await getMysqlPool();
    const config = getRuntimeConfig();
    const client = config.oss.uploadTokenMode === "aliyun" ? getAliOssClient() : null;

    const limit = getPositiveInt(request.nextUrl.searchParams.get("limit"), 24, 60);
    const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset")) || 0);

    const fetchSize = offset + limit;
    const [
      [productCountRows],
      [templateCountRows],
      [generatedCountRows],
      [productRows],
      [templateRows],
      [generatedRows],
    ] = await Promise.all([
      pool.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM product_library WHERE status = 'archived'"),
      pool.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM template_library WHERE status = 'archived'"),
      pool.query<{ count: number }[]>("SELECT COUNT(*) AS count FROM generated_images WHERE status IN ('archived', 'deleted')"),
      pool.query<LibraryRow[]>(`SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM product_library WHERE status = 'archived' ORDER BY updated_at DESC LIMIT ${fetchSize}`),
      pool.query<LibraryRow[]>(`SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'archived' ORDER BY updated_at DESC LIMIT ${fetchSize}`),
      pool.query<LibraryRow[]>(`SELECT id, COALESCE(title, CONCAT('历史成图 #', id)) AS name, tags, oss_key, thumbnail_url, status, created_at, created_at AS updated_at FROM generated_images WHERE status IN ('archived', 'deleted') ORDER BY created_at DESC LIMIT ${fetchSize}`),
    ]);

    const rows: RecycleRow[] = [
      ...productRows.map((row) => ({ ...row, item_type: "product" as const })),
      ...templateRows.map((row) => ({ ...row, item_type: "template" as const })),
      ...generatedRows.map((row) => ({ ...row, item_type: "generated" as const })),
    ].sort((a, b) => rowTime(b) - rowTime(a)).slice(offset, offset + limit);

    const items = rows.map((row) => ({
      id: row.id,
      type: row.item_type,
      name: row.name,
      tags: parseTags(row.tags),
      ossKey: row.oss_key ?? "",
      thumbnailUrl: freshUrl(client, row.oss_key ?? "", row.thumbnail_url ?? "", row.item_type),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
    const counts = {
      products: productCountRows[0]?.count ?? 0,
      templates: templateCountRows[0]?.count ?? 0,
      generated: generatedCountRows[0]?.count ?? 0,
    };
    const total = counts.products + counts.templates + counts.generated;

    return NextResponse.json(ok({
      items,
      counts: { ...counts, total },
      page: { limit, offset, nextOffset: offset + items.length, hasMore: offset + items.length < total },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("DB_ERROR", error instanceof Error ? error.message : "获取回收站失败"),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { type?: LibraryType; id?: number };
    const id = Number(body.id);
    if (!body.type || !Number.isInteger(id) || id <= 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "type and valid id are required"), { status: 400 });
    }

    const pool = await getMysqlPool();
    if (body.type === "product") {
      await pool.execute("UPDATE product_library SET status = 'active' WHERE id = :id AND status = 'archived'", { id });
    } else if (body.type === "template") {
      await pool.execute("UPDATE template_library SET status = 'active' WHERE id = :id AND status = 'archived'", { id });
    } else if (body.type === "generated") {
      await pool.execute("UPDATE generated_images SET status = 'succeeded' WHERE id = :id AND status IN ('archived', 'deleted')", { id });
    } else {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported recycle bin item type"), { status: 400 });
    }

    return NextResponse.json(ok({ restored: true, id, type: body.type }));
  } catch (error) {
    return NextResponse.json(
      fail("DB_ERROR", error instanceof Error ? error.message : "恢复失败"),
      { status: 500 }
    );
  }
}
