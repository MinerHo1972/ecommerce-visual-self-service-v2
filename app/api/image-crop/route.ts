import { NextRequest, NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";

/**
 * Server-side image crop: fetches an OSS object, crops based on ratio
 * region, uploads the result as a reference image, and returns its URL.
 *
 * POST /api/image-crop
 * Body: { ossKey, region: { x, y, width, height }, sourceName }
 * Response: { image: { name, url, thumbnailUrl } }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ossKey, region, sourceName } = body as {
    ossKey: string;
    region: { x: number; y: number; width: number; height: number };
    sourceName: string;
  };

  if (!ossKey || !region || typeof region.x !== "number") {
    return NextResponse.json(fail("VALIDATION_ERROR", "ossKey (or imageUrl) and region are required"), { status: 400 });
  }

  const config = getRuntimeConfig();
  if (config.oss.uploadTokenMode !== "aliyun") {
    return NextResponse.json(fail("CONFIG_ERROR", "OSS not configured"), { status: 503 });
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  const client = new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
  });

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require("sharp");

  try {
    // 1. Fetch source image — ossKey if it looks like a key, otherwise treat as URL
    const isUrl = ossKey.startsWith("http");
    const fetchUrl = isUrl
      ? ossKey
      : client.signatureUrl(ossKey, { method: "GET", expires: 60 });
    const upstream = await fetch(fetchUrl);
    if (!upstream.ok) {
      return NextResponse.json(fail("OSS_ERROR", `Failed to fetch source image: ${upstream.status}`), { status: 502 });
    }
    const sourceBuffer = Buffer.from(await upstream.arrayBuffer());

    // 2. Get metadata for ratio-based crop
    const metadata = await sharp(sourceBuffer).metadata();
    const sourceWidth = metadata.width || 0;
    const sourceHeight = metadata.height || 0;
    if (!sourceWidth || !sourceHeight) {
      return NextResponse.json(fail("IMAGE_ERROR", "Cannot read image dimensions"), { status: 500 });
    }

    // 3. Calculate pixel coordinates from ratio region
    const cropX = Math.max(0, Math.floor(region.x * sourceWidth));
    const cropY = Math.max(0, Math.floor(region.y * sourceHeight));
    const cropWidth = Math.max(1, Math.min(sourceWidth - cropX, Math.round(region.width * sourceWidth)));
    const cropHeight = Math.max(1, Math.min(sourceHeight - cropY, Math.round(region.height * sourceHeight)));

    // 4. Crop with sharp
    const croppedBuffer = await sharp(sourceBuffer)
      .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();

    // 5. Upload cropped image to OSS as reference
    const timestamp = Date.now();
    const safeName = (sourceName || "repaint").replace(/[^a-zA-Z0-9._-]/g, "_");
    const cropKey = `references/${timestamp}_${safeName}_crop.png`;
    await client.put(cropKey, croppedBuffer, { headers: { "Content-Type": "image/png" } });

    const resultUrl = client.signatureUrl(cropKey, { method: "GET", expires: 3600 }).replace(/^http:\/\//, "https://");

    return NextResponse.json(ok({
      image: {
        name: `${sourceName || "repaint"}_crop.png`,
        url: resultUrl,
        thumbnailUrl: resultUrl,
      },
    }));
  } catch (error) {
    return NextResponse.json(
      fail("CROP_ERROR", error instanceof Error ? error.message : "Image crop failed"),
      { status: 500 }
    );
  }
}
