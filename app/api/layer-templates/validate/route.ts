import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { validateLayerTemplateJson } from "@/lib/template-validation";
import type { LayerTemplateJson } from "@/lib/types";

export async function POST(request: Request) {
  const payload = (await request.json()) as { template_json?: LayerTemplateJson };
  if (!payload.template_json) {
    return NextResponse.json(fail("VALIDATION_ERROR", "template_json is required"), { status: 400 });
  }

  const checks = validateLayerTemplateJson(payload.template_json);
  return NextResponse.json(ok({ passed: checks.every((check) => check.passed), checks }));
}
