import { NextResponse } from "next/server";
import { fail, ok } from "@/lib/api-response";
import { getTemplateRepository } from "@/lib/repositories/templates";
import { validateLayerTemplateJson } from "@/lib/template-validation";
import type { LayerTemplateJson } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const template = await getTemplateRepository().getLayerTemplate(Number(id));
  if (!template) {
    return NextResponse.json(fail("NOT_FOUND", "模板不存在"), { status: 404 });
  }

  return NextResponse.json(ok(template));
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const payload = (await request.json()) as {
    name?: string;
    category?: string;
    template_json?: LayerTemplateJson;
    tags?: string[];
    status?: "draft" | "active" | "inactive" | "archived";
  };

  if (payload.template_json) {
    const checks = validateLayerTemplateJson(payload.template_json);
    const failedChecks = checks.filter((check) => !check.passed);
    if (failedChecks.length > 0) {
      return NextResponse.json(fail("VALIDATION_ERROR", "模板 JSON 校验失败", failedChecks), { status: 400 });
    }
  }

  const updated = await getTemplateRepository().updateLayerTemplate(Number(id), {
    name: payload.name,
    category: payload.category,
    templateJson: payload.template_json,
    tags: payload.tags,
    status: payload.status
  });

  if (!updated) {
    return NextResponse.json(fail("NOT_FOUND", "模板不存在"), { status: 404 });
  }

  return NextResponse.json(ok(updated));
}
