import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ali-oss", "mysql2"]
};

export default nextConfig;
