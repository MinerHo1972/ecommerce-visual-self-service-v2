import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { createSignedUrl } from "@/lib/oss";

export async function POST(request: Request) {
  const payload = (await request.json()) as { oss_key?: string };
  if (!payload.oss_key) {
    return NextResponse.json(fail("VALIDATION_ERROR", "oss_key is required"), { status: 400 });
  }

  return NextResponse.json(ok(createSignedUrl(payload.oss_key)));
}
