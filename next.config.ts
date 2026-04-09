import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "ssh2"],
  allowedDevOrigins: ["*"],
};

export default nextConfig;
