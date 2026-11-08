/**
 * 进程内 LRU 缓存：预览图片字节。
 *
 * 目的：A+C 方案中 C 的一部分。私有 / public 预览都允许短缓存（5 分钟），
 * 避免同一缩略图在 Next 服务端被反复回源 TOS 拉全量原图。
 *
 * 注意：
 * - 仅按 asset id 缓存字节；命中即跳过 TOS fetch。
 * - 软删/改名后缓存 TTL 自然过期，最多 5 分钟陈旧；不做主动失效。
 * - standalone 多 cluster 实例各自独立缓存，命中率随实例数下降但无一致性问题。
 * - 大对象（>2MB）不缓存，避免内存膨胀。
 */

interface CacheEntry {
  buffer: Buffer
  contentType: string
  expiresAt: number
  size: number
}

const MAX_ENTRIES = 200
const MAX_ENTRY_BYTES = 2 * 1024 * 1024 // 2MB
const TTL_MS = 5 * 60 * 1000

const cache = new Map<string, CacheEntry>()

function evictIfNeeded() {
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function getPreviewCache(id: string): CacheEntry | null {
  const entry = cache.get(id)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(id)
    return null
  }
  // LRU：命中时移到末尾
  cache.delete(id)
  cache.set(id, entry)
  return entry
}

export function setPreviewCache(
  id: string,
  buffer: Buffer,
  contentType: string,
  ttlMs: number = TTL_MS,
): void {
  if (buffer.length > MAX_ENTRY_BYTES) return
  evictIfNeeded()
  cache.set(id, {
    buffer,
    contentType,
    size: buffer.length,
    expiresAt: Date.now() + ttlMs,
  })
}

export function previewCacheStats() {
  return {
    entries: cache.size,
    maxEntries: MAX_ENTRIES,
    maxEntryBytes: MAX_ENTRY_BYTES,
  }
}
