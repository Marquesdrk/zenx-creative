import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves its binary path from __dirname at import time — bundling it
  // rewrites that path and breaks it, so it must run via native require instead.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "fluent-ffmpeg"],
  outputFileTracingIncludes: {
    "/api/batches/export-local": ["./assets/fonts/arialbd.ttf"],
  },
};

export default nextConfig;
