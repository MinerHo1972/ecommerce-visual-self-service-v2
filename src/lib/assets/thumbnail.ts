import sharp from "sharp"
import { putObject } from "@/lib/tos/tos-client"

/**
 * B 方案：服务端生成 400px 长边缩略图。
 * - 等比缩放，长边不超过 THUMB_MAX_EDGE（400），短边自适应。
 * - 输出 JPEG（quality 80，progressive），显著降低字节体积。
 * - 原图本身小于阈值时不放大，仍生成缩略图（统一格式/体积）。
 * - 生成失败不阻断主流程，调用方 catch 后回退原图。
 */
export const THUMB_MAX_EDGE = 400
export const THUMB_MIME = "image/jpeg"

export interface ThumbResult {
  buffer: Buffer
  contentType: string
}

export async function generateThumbnail(
  source: Buffer,
  maxEdge = THUMB_MAX_EDGE
): Promise<ThumbResult> {
  // 不放大：withoutEnlargement
  const buffer = await sharp(source, { failOn: "none" })
    .rotate() // 尊重 EXIF 方向
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toBuffer()
  return { buffer, contentType: THUMB_MIME }
}

/**
 * 由原图 TOS key 派生缩略图 key：
 *   assets/<owner>/<yyyymm>/<ts>-<name>  ->  assets/<owner>/<yyyymm>/thumbs/<ts>-<name>.jpg
 * 统一落在同目录 thumbs/ 下，扩展名归一为 .jpg。
 */
export function buildThumbKey(originalKey: string): string {
  const slash = originalKey.lastIndexOf("/")
  const dir = slash >= 0 ? originalKey.slice(0, slash) : ""
  const base = slash >= 0 ? originalKey.slice(slash + 1) : originalKey
  const dot = base.lastIndexOf(".")
  const stem = dot > 0 ? base.slice(0, dot) : base
  return `${dir}/thumbs/${stem}.jpg`
}

/**
 * 生成缩略图并上传 TOS，返回 thumb key。
 * 任何失败都抛出，由调用方决定是否回退原图（不阻断主写入）。
 */
export async function createAndUploadThumb(
  source: Buffer,
  originalKey: string
): Promise<string> {
  const { buffer, contentType } = await generateThumbnail(source)
  const thumbKey = buildThumbKey(originalKey)
  await putObject(thumbKey, buffer, contentType)
  return thumbKey
}
