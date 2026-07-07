import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";

type ReferenceImageItem = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string;
  size: number;
  uploadedAt: string;
};

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

export async function GET() {
  const config = getRuntimeConfig();
  const prefix = "references/";

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const result = await client.list({ prefix, "max-keys": 200 });
      const objects = (result.objects ?? []) as Array<{ name: string; size: number; lastModified: string; url: string }>;

      const images: ReferenceImageItem[] = objects
        .filter((obj) => obj.name !== prefix && !obj.name.endsWith("/"))
        .map((obj) => {
          const signedUrl = toHttpsUrl(client.signatureUrl(obj.name, { method: "GET", expires: 3600 }));
          const fileName = obj.name.replace(prefix, "");
          return {
            id: obj.name,
            name: fileName,
            url: signedUrl,
            thumbnailUrl: signedUrl,
            size: obj.size,
            uploadedAt: obj.lastModified,
          };
        });

      return NextResponse.json(ok({ images }));
    }

    // mock mode
    return NextResponse.json(ok({ images: [] }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "列举参考图失败"),
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

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
  const ossKey = `references/${timestamp}_${sanitized}`;

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      const buffer = Buffer.from(await file.arrayBuffer());
      await client.put(ossKey, buffer, { headers: { "Content-Type": file.type } });
      const signedUrl = toHttpsUrl(client.signatureUrl(ossKey, { method: "GET", expires: 3600 }));

      return NextResponse.json(ok({
        image: {
          id: ossKey,
          name: sanitized,
          url: signedUrl,
          thumbnailUrl: signedUrl,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        },
      }));
    }

    return NextResponse.json(ok({
      image: { id: ossKey, name: sanitized, url: "", thumbnailUrl: "", size: file.size, uploadedAt: new Date().toISOString() },
    }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "上传参考图失败"),
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

  const config = getRuntimeConfig();

  try {
    if (config.oss.uploadTokenMode === "aliyun") {
      const client = getAliOssClient();
      await client.delete(id);
      return NextResponse.json(ok({ deleted: true }));
    }
    // mock mode
    return NextResponse.json(ok({ deleted: true }));
  } catch (err) {
    return NextResponse.json(
      fail("OSS_ERROR", err instanceof Error ? err.message : "删除失败"),
      { status: 500 }
    );
  }
}
