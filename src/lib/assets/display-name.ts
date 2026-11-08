export const MAX_ASSET_DISPLAY_NAME_LENGTH = 100

export function deriveAssetDisplayName(filename: string) {
  const trimmed = filename.trim()
  const withoutLastExtension = trimmed.replace(/\.[^.]+$/, '').trim()
  const value = withoutLastExtension || trimmed || '未命名素材'
  return value.slice(0, MAX_ASSET_DISPLAY_NAME_LENGTH)
}

export function resolveAssetDisplayName(displayName: string | null | undefined, filename: string) {
  const normalized = displayName?.trim()
  return normalized || deriveAssetDisplayName(filename)
}

export function validateAssetDisplayName(value: unknown) {
  if (typeof value !== 'string') {
    return { ok: false as const, message: 'display_name 必须是字符串' }
  }
  const normalized = value.trim()
  if (!normalized) {
    return { ok: false as const, message: '展示名称不能为空' }
  }
  if (normalized.length > MAX_ASSET_DISPLAY_NAME_LENGTH) {
    return { ok: false as const, message: '展示名称不能超过 100 个字符' }
  }
  return { ok: true as const, value: normalized }
}
