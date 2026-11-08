import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 允许从 TOS 域名加载图片
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.volces.com" },
      { protocol: "https", hostname: "*.tos-cn-*.volces.com" },
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Prisma 7 + pg 需要排除打包，走运行时 require
  serverExternalPackages: ["@prisma/client", "pg", "@prisma/adapter-pg", "@volcengine/tos-sdk", "@napi-rs/canvas", "sharp"],
};

export default nextConfig;
