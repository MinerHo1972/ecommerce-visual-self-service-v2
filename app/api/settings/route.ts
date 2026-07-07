import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getRuntimeConfig } from "@/lib/config";
import { getRuntimeSettings, updateRuntimeSettings } from "@/lib/runtime-settings";

export async function GET() {
  try {
    const config = getRuntimeConfig();
    const safeConfig = {
      appName: config.appName,
      templateRepositoryMode: config.templateRepositoryMode,
      generationJobRepositoryMode: config.generationJobRepositoryMode,
      generationMode: config.generationMode,
      qualityReviewEnabled: config.qualityReviewEnabled,
      oss: {
        region: config.oss.region,
        bucket: config.oss.bucket,
        publicBaseUrl: config.oss.publicBaseUrl ?? null,
        uploadTokenMode: config.oss.uploadTokenMode,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        buildTime: new Date().toISOString(),
      },
    };

    return NextResponse.json(ok(safeConfig));
  } catch (err) {
    return NextResponse.json(
      fail("CONFIG_ERROR", err instanceof Error ? err.message : "读取配置失败"),
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    type PatchAction = "toggle_quality_review";

    const action = body.action as PatchAction;
    if (!action) {
      return NextResponse.json(fail("INVALID_ACTION", "缺少 action 参数"), { status: 400 });
    }

    if (action === "toggle_quality_review") {
      const current = getRuntimeSettings();
      const nextEnabled = !(current.qualityReviewEnabled ?? true);
      updateRuntimeSettings({ qualityReviewEnabled: nextEnabled });

      const config = getRuntimeConfig();
      return NextResponse.json(ok({
        qualityReviewEnabled: config.qualityReviewEnabled,
        previousEnabled: !nextEnabled,
      }));
    }

    return NextResponse.json(fail("UNKNOWN_ACTION", `未知操作: ${action}`), { status: 400 });
  } catch (err) {
    return NextResponse.json(
      fail("CONFIG_UPDATE_ERROR", err instanceof Error ? err.message : "更新配置失败"),
      { status: 500 }
    );
  }
}
