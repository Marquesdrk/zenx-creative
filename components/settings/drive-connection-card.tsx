"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export function DriveConnectionCard() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<{ configured: boolean; connected: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/drive/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, connected: false }));
  }, []);

  if (!status) return null;

  const justConnected = searchParams.get("drive_connected") === "1";
  const driveError = searchParams.get("drive_error");
  const connected = status.connected || justConnected;

  return (
    <div className="mb-6 flex items-center justify-between rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">Google Drive</p>
        <p className="text-xs text-muted">
          {!status.configured
            ? "Não configurado — defina as credenciais no .env.local (veja .env.local.example)."
            : connected
              ? 'Conectado — renders concluídos são enviados para "Vídeos para postar".'
              : "Não conectado."}
        </p>
        {driveError && <p className="mt-1 text-xs text-red-400">Erro ao conectar: {driveError}</p>}
      </div>
      {status.configured && !connected && (
        <a
          href="/api/drive/connect"
          className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background"
        >
          Conectar
        </a>
      )}
    </div>
  );
}
