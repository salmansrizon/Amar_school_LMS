import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Keep @react-pdf/renderer out of the server bundle so its font/stream
  // internals resolve at runtime on the Node serverless runtime (ADR 0007).
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
