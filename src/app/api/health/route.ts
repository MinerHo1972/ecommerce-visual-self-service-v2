import { NextResponse } from "next/server";

/**
 * GET /api/health
 * 健康检查端点，供 Nginx / 监控探活使用
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ecommerce-visual-self-service-v2",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
