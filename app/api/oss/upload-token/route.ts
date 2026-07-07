import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { createUploadToken, type UploadTokenRequest } from "@/lib/oss";

const maxImageSize = 20 * 1024 * 1024;

function validatePayload(payload: Partial<UploadTokenRequest>): string[] {
  const errors: string[] = [];
  if (!payload.asset_type) errors.push("asset_type is required");
  if (!payload.file_name) errors.push("file_name is required");
  if (!payload.content_type?.startsWith("image/")) errors.push("content_type must be an image type");
  if (!payload.size || payload.size <= 0 || payload.size > maxImageSize) errors.push("size must be between 1 byte and 20MB");
  return errors;
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<UploadTokenRequest>;
  const errors = validatePayload(payload);
  if (errors.length > 0) {
    return NextResponse.json(fail("VALIDATION_ERROR", "上传参数不合法", errors), { status: 400 });
  }

  try {
    return NextResponse.json(ok(createUploadToken(payload as UploadTokenRequest)));
  } catch (error) {
    return NextResponse.json(fail("OSS_ADAPTER_ERROR", error instanceof Error ? error.message : "OSS 签名失败"), { status: 500 });
  }
}
