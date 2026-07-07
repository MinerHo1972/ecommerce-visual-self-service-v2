import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getMysqlPool } from "@/lib/db/mysql";
import { getGenerationJobRepository } from "@/lib/repositories/generation-jobs";
import type { GeneratedImage, GenerationStatus } from "@/lib/types";

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

function withTags(tags: string[], extraTags: string[]) {
  return Array.from(new Set([...tags, ...extraTags]));
}

function getSignedUrl(client: ReturnType<typeof getAliOssClient> | null, row: LibraryRow) {
  let thumbnailUrl = toHttpsUrl(row.thumbnail_url);
  if (client && row.oss_key) {
    try {
      thumbnailUrl = toHttpsUrl(client.signatureUrl(row.oss_key, { method: "GET", expires: 3600 }));
    } catch { /* fallback to stored URL */ }
  }
  return thumbnailUrl;
}

function mapLibraryRow(row: LibraryRow, source: "product" | "template", client: ReturnType<typeof getAliOssClient> | null): GeneratedImage {
  const usageTag = source === "product" ? "usage:product" : "usage:template";
  const usageLabel = source === "product" ? "产品" : "模板";
  return {
    id: -Number(`${source === "product" ? 1 : 2}${row.id}`),
    jobId: `${source}:${row.id}`,
    templateId: 0,
    templateName: usageLabel,
    title: row.name,
    scene: usageLabel,
    platform: "图库",
    ossKey: row.oss_key,
    thumbnailUrl: getSignedUrl(client, row),
    width: 800,
    height: 800,
    status: row.status === "archived" ? "archived" : "succeeded" as GenerationStatus,
    selected: false,
    tags: withTags(parseTags(row.tags), [usageTag, `asset:${source}:${row.id}`]),
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageSize = Math.min(Number(searchParams.get("page_size") ?? 100), 200);
    const generated = await getGenerationJobRepository().listGeneratedImages({ page: 1, pageSize });

    const pool = await getMysqlPool();
    const config = getRuntimeConfig();
    const client = config.oss.uploadTokenMode === "aliyun" ? getAliOssClient() : null;
    const [productRows] = await pool.query<LibraryRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM product_library WHERE status = 'active' ORDER BY updated_at DESC LIMIT 200"
    );
    const [templateRows] = await pool.query<LibraryRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM template_library WHERE status = 'active' ORDER BY updated_at DESC LIMIT 200"
    );

    const items = [
      ...generated.items,
      ...productRows.map((row) => mapLibraryRow(row, "product", client)),
      ...templateRows.map((row) => mapLibraryRow(row, "template", client)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json(ok({
      items,
      page: 1,
      page_size: items.length,
      total: items.length,
      sources: {
        generated: generated.items.length,
        product: productRows.length,
        template: templateRows.length,
      },
    }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "获取图库失败"),
      { status: 500 }
    );
  }
}
