import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/config";

/**
 * Same-origin image proxy: fetches an OSS object server-side and returns it
 * with permissive CORS headers. This bypasses browser cross-origin canvas
 * taint when the OSS bucket has no CORS rule configured.
 *
 * Usage: GET /api/image-proxy?oss_key=generated/grsai/job_x/candidate_1.png
 */
export async function GET(request: NextRequest) {
  const ossKey = request.nextUrl.searchParams.get("oss_key");
  if (!ossKey) {
    return NextResponse.json(
      { success: false, error: "oss_key is required" },
      { status: 400 }
    );
  }

  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") {
    return NextResponse.json(
      { success: false, error: "OSS not configured" },
      { status: 503 }
    );
  }

  try {
    const OSS = require("ali-oss");
    const client = new OSS({
      region: config.oss.region,
      accessKeyId: config.oss.accessKeyId,
      accessKeySecret: config.oss.accessKeySecret,
      bucket: config.oss.bucket,
    });

    const signedUrl = client.signatureUrl(ossKey, { method: "GET", expires: 60 });
    const upstream = await fetch(signedUrl);

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await upstream.arrayBuffer());

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Proxy failed" },
      { status: 500 }
    );
  }
}
