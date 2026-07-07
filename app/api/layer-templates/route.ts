import { NextResponse } from "next/server";
import { ok } from "@/lib/api-response";
import { getTemplateRepository } from "@/lib/repositories/templates";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repository = getTemplateRepository();
  const result = await repository.listLayerTemplates({
    keyword: searchParams.get("keyword") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    page: Number(searchParams.get("page") ?? 1),
    pageSize: Number(searchParams.get("page_size") ?? 20)
  });

  return NextResponse.json(ok(result));
}
