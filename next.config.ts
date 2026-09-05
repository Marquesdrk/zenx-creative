import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só a Vercel injeta VERCEL=1 no build/runtime, e só no servidor — expõe pro client também
  // porque o editor decide ali se usa o Vercel Blob como ponte pro vídeo original (necessário
  // só pra contornar o limite de payload das functions da Vercel; localmente não existe esse
  // limite, então local envia o arquivo direto, sem Blob).
  env: {
    NEXT_PUBLIC_IS_VERCEL: process.env.VERCEL ?? "",
  },
  // ffmpeg-static resolves its binary path from __dirname at import time — bundling it
  // rewrites that path and breaks it, so it must run via native require instead.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static", "fluent-ffmpeg"],
  outputFileTracingIncludes: {
    "/api/batches/export-local": ["./assets/fonts/arialbd.ttf"],
  },
};

export default nextConfig;
