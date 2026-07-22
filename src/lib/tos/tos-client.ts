import { TosClient } from '@volcengine/tos-sdk'

let client: TosClient | null = null

export function getTosClient(): TosClient {
  if (client) return client

  const accessKeyId = process.env.TOS_ACCESS_KEY
  const accessKeySecret = process.env.TOS_SECRET_KEY
  const region = process.env.TOS_REGION
  const endpoint = process.env.TOS_ENDPOINT

  if (!accessKeyId || !accessKeySecret || !region || !endpoint) {
    throw new Error('TOS configuration missing: TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_REGION, TOS_ENDPOINT')
  }

  client = new TosClient({
    accessKeyId,
    accessKeySecret,
    region,
    endpoint,
  })

  return client
}

export function getBucket(): string {
  const bucket = process.env.TOS_BUCKET
  if (!bucket) throw new Error('TOS_BUCKET environment variable is not set')
  return bucket
}

/**
 * Upload a file buffer to TOS
 */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  const tos = getTosClient()
  const bucket = getBucket()
  await tos.putObject({
    bucket,
    key,
    body,
    contentType,
  })
}

/**
 * Generate a pre-signed URL for downloading an object (default 10 minutes)
 */
export function getSignedUrl(key: string, expiresSeconds = 600): string {
  const tos = getTosClient()
  const bucket = getBucket()
  return tos.getPreSignedUrl({
    bucket,
    key,
    method: 'GET',
    expires: expiresSeconds,
  })
}

/**
 * Delete an object from TOS (kept for future use)
 */
export async function deleteObject(key: string): Promise<void> {
  const tos = getTosClient()
  const bucket = getBucket()
  await tos.deleteObject({
    bucket,
    key,
  })
}

/**
 * Build a deterministic TOS key for an asset
 */
export function buildTosKey(ownerId: string, filename: string): string {
  const date = new Date()
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  const timestamp = Date.now()
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  return `assets/${ownerId}/${yyyymm}/${timestamp}-${safeName}`
}
