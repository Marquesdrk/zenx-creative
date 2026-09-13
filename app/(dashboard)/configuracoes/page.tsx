"use client";

import { Suspense } from "react";
import { DriveConnectionCard } from "@/components/settings/drive-connection-card";
import { OpenAiConnectionCard } from "@/components/settings/openai-connection-card";
import { MetaProfileSettings } from "@/components/settings/meta-profile-settings";

export default function ConfiguracoesPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-foreground">Configurações</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Personalize perfis, convites, armazenamento e integrações do sistema em um só lugar.
      </p>

      <MetaProfileSettings />
      <Suspense fallback={null}>
        <DriveConnectionCard />
      </Suspense>
      <OpenAiConnectionCard />
    </div>
  );
}
