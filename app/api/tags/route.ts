import { NextResponse } from "next/server";
import { ok } from "@/lib/api-response";

const tags = [
  { id: 1, dimension: "activity", tag_value: "618", display_name: "618", sort_order: 10 },
  { id: 2, dimension: "activity", tag_value: "double11", display_name: "双11", sort_order: 20 },
  { id: 3, dimension: "platform", tag_value: "tmall", display_name: "天猫", sort_order: 10 },
  { id: 4, dimension: "platform", tag_value: "xiaohongshu", display_name: "小红书", sort_order: 20 }
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dimension = searchParams.get("dimension");
  const items = dimension ? tags.filter((tag) => tag.dimension === dimension) : tags;
  return NextResponse.json(ok({ items }));
}
