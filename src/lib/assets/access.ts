export type AssetAccessSubject = {
  userId: string
  role: string
}

export type AssetAccessTarget = {
  owner_id: string
  visibility: string
  deleted_at: Date | null
}

export function canReadAsset(subject: AssetAccessSubject, asset: AssetAccessTarget) {
  if (asset.deleted_at) return false
  return (
    asset.owner_id === subject.userId ||
    subject.role === 'admin' ||
    asset.visibility === 'public'
  )
}

export function canWriteAsset(subject: AssetAccessSubject, asset: AssetAccessTarget) {
  if (asset.deleted_at) return false
  return asset.owner_id === subject.userId || subject.role === 'admin'
}

export function assetPreviewCacheControl(visibility: string) {
  // A+C：私有图也允许浏览器短缓存 5 分钟，配合服务端 LRU 显著降低缩略图回源。
  // 私有资产仍通过签名鉴权控制访问；CDN/共享代理不缓存（private）。
  return visibility === 'public'
    ? 'public, max-age=300'
    : 'private, max-age=300'
}
