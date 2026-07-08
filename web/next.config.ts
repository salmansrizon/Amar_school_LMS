import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Keep @react-pdf/renderer out of the server bundle so its font/stream
  // internals resolve at runtime on the Node serverless runtime (ADR 0007).
  serverExternalPackages: ["@react-pdf/renderer"],
  // The Hind Siliguri TTFs are loaded by a computed path handed to react-pdf
  // (an external package), so @vercel/nft can't statically trace them and would
  // ship the print function without the fonts — Font.register would then hit a
  // missing path at runtime in production. Force them into the trace.
  outputFileTracingIncludes: {
    "/api/print/**": ["./lib/pdf/fonts/**/*"],
  },
};

export default nextConfig;
