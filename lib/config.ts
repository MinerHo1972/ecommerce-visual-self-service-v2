import { getRuntimeSettings } from "./runtime-settings";

export type RuntimeConfig = {
  appName: string;
  databaseUrl?: string;
  templateRepositoryMode: "mock" | "rds";
  generationJobRepositoryMode: "mock" | "rds";
  generationMode: "mock" | "grsai";
  qualityReviewEnabled: boolean;
  oss: {
    region: string;
    bucket: string;
    publicBaseUrl?: string;
    uploadTokenMode: "mock" | "aliyun";
    accessKeyId: string;
    accessKeySecret: string;
  };
};

export function getRuntimeConfig(): RuntimeConfig {
  return {
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "电商视觉自助台",
    databaseUrl: process.env.DATABASE_URL,
    templateRepositoryMode: process.env.TEMPLATE_REPOSITORY_MODE === "rds" ? "rds" : "mock",
    generationJobRepositoryMode: process.env.GENERATION_JOB_REPOSITORY_MODE === "rds" ? "rds" : "mock",
    generationMode: process.env.GENERATION_MODE === "grsai" ? "grsai" : "mock",
    qualityReviewEnabled: getRuntimeSettings().qualityReviewEnabled ?? (process.env.QUALITY_REVIEW_ENABLED !== "false"),
    oss: {
      region: process.env.OSS_REGION ?? "oss-cn-hangzhou",
      bucket: process.env.OSS_BUCKET ?? "ecommerce-visual-assets",
      publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL,
      uploadTokenMode: process.env.OSS_UPLOAD_TOKEN_MODE === "aliyun" ? "aliyun" : "mock",
      accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? "",
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? ""
    }
  };
}
