"use client";

import { Suspense } from "react";
import { DriveConnectionCard } from "@/components/settings/drive-connection-card";
import { OpenAiConnectionCard } from "@/components/settings/openai-connection-card";

export default function ConfiguracoesPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Configurações</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Conexões e integrações da sua conta. Para editar perfis e templates, veja{" "}
        <a href="/templates" className="text-accent underline">
          Templates
        </a>
        .
      </p>

      <Suspense fallback={null}>
        <DriveConnectionCard />
      </Suspense>
      <OpenAiConnectionCard />
    </div>
  );
}
