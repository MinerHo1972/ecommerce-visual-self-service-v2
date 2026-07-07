import { getRuntimeConfig } from "./config";

export type OssAssetType =
  | "layer_template_base"
  | "reference_image"
  | "product_upload"
  | "generated_image";

export type UploadTokenRequest = {
  asset_type: OssAssetType;
  file_name: string;
  content_type: string;
  size: number;
};

export type UploadTokenResponse = {
  oss_key: string;
  upload_url: string;
  headers: Record<string, string>;
  expires_at: string;
};

const assetTypeDirs: Record<OssAssetType, string> = {
  layer_template_base: "layer-templates/base",
  reference_image: "reference-images/original",
  product_upload: "uploads/product",
  generated_image: "generated-images/original"
};

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function buildOssKey(input: UploadTokenRequest): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const nonce = Math.random().toString(36).slice(2, 10);
  return `prod/${assetTypeDirs[input.asset_type]}/${yyyy}/${mm}/${dd}/${nonce}_${sanitizeFileName(input.file_name)}`;
}

function getAliOssClient() {
  const config = getRuntimeConfig();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss");
  return new OSS({
    region: config.oss.region,
    accessKeyId: config.oss.accessKeyId,
    accessKeySecret: config.oss.accessKeySecret,
    bucket: config.oss.bucket,
    // Use signatureUrl v1 for PUT presigned URL compatibility
    authorization: "signature",
  });
}

export function createUploadToken(input: UploadTokenRequest): UploadTokenResponse {
  const config = getRuntimeConfig();
  const ossKey = buildOssKey(input);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  if (config.oss.uploadTokenMode === "aliyun") {
    const client = getAliOssClient();
    // Generate a presigned PUT URL for direct browser upload
    const url = client.signatureUrl(ossKey, {
      method: "PUT",
      expires: 600, // 10 minutes
      headers: { "Content-Type": input.content_type },
    });
    return {
      oss_key: ossKey,
      upload_url: url,
      headers: { "Content-Type": input.content_type },
      expires_at: expiresAt,
    };
  }

  const baseUrl = config.oss.publicBaseUrl ?? `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
  return {
    oss_key: ossKey,
    upload_url: `${baseUrl}/${ossKey}?mock_upload_token=local-dev`,
    headers: { "content-type": input.content_type },
    expires_at: expiresAt,
  };
}

export function createSignedUrl(ossKey: string): { url: string; expires_in: number } {
  const config = getRuntimeConfig();

  if (config.oss.uploadTokenMode === "aliyun") {
    const client = getAliOssClient();
    const url = client.signatureUrl(ossKey, {
      method: "GET",
      expires: 3600,
    });
    return { url, expires_in: 3600 };
  }

  const baseUrl = config.oss.publicBaseUrl ?? `https://${config.oss.bucket}.${config.oss.region}.aliyuncs.com`;
  return { url: `${baseUrl}/${ossKey}?mock_signed_url=local-dev`, expires_in: 3600 };
}
