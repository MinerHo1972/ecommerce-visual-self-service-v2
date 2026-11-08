/**
 * B 方案历史回填：为所有缺 thumb_tos_key 的活跃图片生成 400px 缩略图并上传 TOS。
 *
 * 用法：
 *   npx tsx src/scripts/backfill-thumbnails.ts            # 处理全部缺缩略图的活跃资产
 *   npx tsx src/scripts/backfill-thumbnails.ts --dry-run  # 只统计不执行
 *   npx tsx src/scripts/backfill-thumbnails.ts --limit=50 # 限量处理（调试）
 *
 * 特性：
 * - 按 id 游标分页（每页 20），避免一次性加载全部 Buffer 撑爆内存
 * - 单张失败不阻断整体，错误打印后继续
 * - 缩略图已存在的资产跳过
 * - 缩略图 key 由 buildThumbKey 从原 key 派生，幂等（重复跑会覆盖同 key）
 */
import "dotenv/config"
import { prisma } from "../lib/db/prisma"
import { putObject, getSignedUrl } from "../lib/tos/tos-client"
import { generateThumbnail, buildThumbKey } from "../lib/assets/thumbnail"

const PAGE_SIZE = 20

async function downloadFromTos(key: string): Promise<Buffer> {
  // 用预签名 URL fetch 下载（与 preview 路由同源方式一致，避免 SDK getObject 流格式差异）
  const url = getSignedUrl(key, 300)
  const r = await fetch(url)
  if (!r.ok) throw new Error(`download ${key} failed: ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const limitArg = args.find((a) => a.startsWith("--limit="))
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity

  const total = await prisma.asset.count({
    where: { deleted_at: null, thumb_tos_key: null },
  })
  console.log(`[backfill] active assets without thumbnail: ${total}${dryRun ? " (dry-run)" : ""}${Number.isFinite(limit) ? `, limit=${limit}` : ""}`)

  if (dryRun) {
    await prisma.$disconnect()
    return
  }

  let processed = 0
  let succeeded = 0
  let failed = 0
  let skippedSmall = 0
  let cursor: string | undefined = undefined
  const toProcess = Math.min(total, Number.isFinite(limit) ? limit : total)

  while (processed < toProcess) {
    type ThumbCandidate = { id: string; tos_key: string; mime_type: string; width: number | null; height: number | null }
    const items: ThumbCandidate[] = await prisma.asset.findMany({
      where: {
        deleted_at: null,
        thumb_tos_key: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, tos_key: true, mime_type: true, width: true, height: true },
      take: PAGE_SIZE,
      orderBy: { id: "asc" },
    })
    if (items.length === 0) break

    for (const asset of items) {
      if (processed >= toProcess) break
      processed++
      try {
        const source = await downloadFromTos(asset.tos_key)
        const { buffer, contentType } = await generateThumbnail(source)

        // 原图本身很小（缩略图不比原图小或等大）也照常写，保持统一
        if (buffer.length >= source.length) {
          skippedSmall++
        }

        const thumbKey = buildThumbKey(asset.tos_key)
        await putObject(thumbKey, buffer, contentType)

        await prisma.asset.update({
          where: { id: asset.id },
          data: { thumb_tos_key: thumbKey },
        })
        succeeded++
        console.log(`[backfill] (${processed}/${toProcess}) OK ${asset.id} ${source.length}B -> ${buffer.length}B key=${thumbKey}`)
      } catch (err) {
        failed++
        console.error(`[backfill] (${processed}/${toProcess}) FAIL ${asset.id}: ${err instanceof Error ? err.message : err}`)
      }
    }

    cursor = items[items.length - 1]?.id
    if (!cursor) break
  }

  console.log(`[backfill] done. processed=${processed} succeeded=${succeeded} failed=${failed} same-or-larger=${skippedSmall}`)
  await prisma.$disconnect()
  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error("[backfill] fatal:", err)
  process.exit(1)
})
