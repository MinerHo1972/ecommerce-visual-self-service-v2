import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getMysqlPool } from "@/lib/db/mysql";
import { getRuntimeConfig } from "@/lib/config";

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

function guessContentType(url: string, response: Response): string {
  const responseType = response.headers.get("content-type");
  if (responseType?.startsWith("image/")) return responseType.split(";")[0];
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function extensionFromContentType(contentType: string): string {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  if (contentType === "image/svg+xml") return "svg";
  return "png";
}

async function persistImageFromUrl(sourceUrl: string, ossKeyPrefix: string): Promise<{ ossKey: string; thumbnailUrl: string }> {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`下载图片失败: ${response.status}`);
  const contentType = guessContentType(sourceUrl, response);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ossKey = `${ossKeyPrefix}.${extensionFromContentType(contentType)}`;

  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") return { ossKey, thumbnailUrl: sourceUrl };

  const client = getAliOssClient();
  await client.put(ossKey, buffer, { headers: { "Content-Type": contentType } });
  return { ossKey, thumbnailUrl: toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 })) };
}

type ProductRow = {
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

export async function GET() {
  try {
    const pool = await getMysqlPool();
    const [rows] = await pool.query<ProductRow[]>(
      "SELECT id, name, tags, oss_key, thumbnail_url, status, created_at, updated_at FROM product_library WHERE status = 'active' ORDER BY updated_at DESC"
    );
    const config = getRuntimeConfig();
    let client: ReturnType<typeof getAliOssClient> | null = null;
    if (config.oss.uploadTokenMode === "aliyun") {
      client = getAliOssClient();
    }
    const products = rows.map((r) => {
      // Always regenerate fresh signed URL from oss_key
      let thumbnailUrl = toHttpsUrl(r.thumbnail_url);
      if (client && r.oss_key) {
        try {
          thumbnailUrl = toHttpsUrl(client.signatureUrl(r.oss_key, { method: "GET", expires: 3600 }));
        } catch { /* fallback to stored URL */ }
      }
      return {
        id: r.id,
        name: r.name,
        tags: parseTags(r.tags),
        ossKey: r.oss_key,
        thumbnailUrl,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });
    return NextResponse.json(ok({ products }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "获取产品列表失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    const { action, sourceUrl, name, tags } = body as {
      action?: string;
      sourceUrl?: string;
      name?: string;
      tags?: string[];
    };

    if (action !== "save_from_url") {
      return NextResponse.json(fail("VALIDATION_ERROR", "unsupported action"), { status: 400 });
    }
    if (!sourceUrl?.trim()) {
      return NextResponse.json(fail("VALIDATION_ERROR", "sourceUrl is required"), { status: 400 });
    }

    try {
      const timestamp = Date.now();
      const productName = name?.trim() || "保存的产品图";
      const saved = await persistImageFromUrl(sourceUrl.trim(), `products/saved/${timestamp}`);
      const pool = await getMysqlPool();
      const productTags = JSON.stringify(Array.isArray(tags) ? tags.map(String).filter(Boolean) : ["saved_from_generated"]);
      const [result] = await pool.execute<{ insertId: number }>(
        "INSERT INTO product_library (name, tags, oss_key, thumbnail_url) VALUES (:name, :tags, :ossKey, :thumbnailUrl)",
        { name: productName, tags: productTags, ossKey: saved.ossKey, thumbnailUrl: saved.thumbnailUrl }
      );

      return NextResponse.json(ok({
        product: {
          id: result.insertId,
          name: productName,
          tags: JSON.parse(productTags),
          ossKey: saved.ossKey,
          thumbnailUrl: saved.thumbnailUrl,
          status: "active",
        },
      }));
    } catch (err) {
      return NextResponse.json(
        fail("SAVE_FROM_URL_ERROR", err instanceof Error ? err.message : "保存到产品库失败"),
        { status: 500 }
      );
    }
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name") as string | null;

  if (!(file instanceof File)) {
    return NextResponse.json(fail("VALIDATION_ERROR", "file is required"), { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json(fail("VALIDATION_ERROR", "只支持图片文件"), { status: 400 });
  }
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) {
    return NextResponse.json(fail("VALIDATION_ERROR", "图片大小需在 20MB 以内"), { status: 400 });
  }

  const config = getRuntimeConfig();
  const timestamp = Date.now();
  const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ossKey = `products/${timestamp}_${sanitized}`;

  try {
    let thumbnailUrl = "";

    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const buffer = Buffer.from(await file.arrayBuffer());
      await client.put(ossKey, buffer, { headers: { "Content-Type": file.type } });
      thumbnailUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));
    }

    const pool = await getMysqlPool();
    const productName = name || sanitized.replace(/\.[^.]+$/, "");
    const [result] = await pool.execute<{ insertId: number }>(
      "INSERT INTO product_library (name, oss_key, thumbnail_url) VALUES (:name, :ossKey, :thumbnailUrl)",
      { name: productName, ossKey, thumbnailUrl }
    );

    return NextResponse.json(ok({
      product: {
        id: result.insertId,
        name: productName,
        ossKey,
        thumbnailUrl,
        status: "active",
      },
    }));
  } catch (err) {
    return NextResponse.json(
      fail("UPLOAD_ERROR", err instanceof Error ? err.message : "上传产品图失败"),
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, name, status } = body as { id: number; name?: string; status?: string };

  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    const sets: string[] = [];
    const params: Record<string, unknown> = { id };

    if (name !== undefined) { sets.push("name = :name"); params.name = name; }
    if (status !== undefined) { sets.push("status = :status"); params.status = status; }

    if (sets.length === 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "nothing to update"), { status: 400 });
    }

    await pool.execute(`UPDATE product_library SET ${sets.join(", ")} WHERE id = :id`, params);
    return NextResponse.json(ok({ updated: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "更新失败"),
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json(fail("VALIDATION_ERROR", "id is required"), { status: 400 });
  }

  try {
    const pool = await getMysqlPool();
    // Soft delete
    await pool.execute("UPDATE product_library SET status = 'archived' WHERE id = :id", { id: Number(id) });
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    return NextResponse.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "删除失败"),
      { status: 500 }
    );
  }
}
