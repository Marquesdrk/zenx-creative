"use client";

import { useEffect, useState } from "react";
import { HardDrive, Loader2, X } from "lucide-react";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

/** Escolhe a conta de destino antes de enviar um lote pro Drive — a pasta é organizada por
 *  conta ("Zenx Creative - Agendados/@conta"), então o sistema precisa saber qual conta antes
 *  de decidir onde gravar, mesmo que a publicação de fato ainda não tenha sido agendada. */
export function SendToDriveModal({
  onClose,
  onConfirm,
  sending,
  progressLabel,
  error,
}: {
  onClose: () => void;
  onConfirm: (socialAccountId: string) => void;
  sending: boolean;
  progressLabel: string | null;
  error: string | null;
}) {
  const [accounts, setAccounts] = useState<PublicSocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/meta/accounts")
      .then((res) => res.json())
      .then((data: PublicSocialAccount[]) => {
        const connected = data.filter((a) => a.status === "connected" && a.platform === "INSTAGRAM");
        setAccounts(connected);
        if (connected.length === 1) setSelected(connected[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-6">
      <div className="w-[420px] rounded-2xl border border-border bg-[#101010] p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <HardDrive size={18} />
            Enviar lote para o Drive
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg p-1 text-gray-400 hover:bg-card-hover hover:text-foreground disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          Renderiza os vídeos concluídos e envia direto pra pasta &quot;Zenx Creative - Agendados/@conta&quot;
          da conta escolhida, pronta pra ser usada no agendamento automático em Publicar.
        </p>

        <div className="mt-4">
          {loading ? (
            <p className="text-xs text-muted">Carregando contas conectadas…</p>
          ) : accounts.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted">
              Nenhuma conta do Instagram conectada — conecte em &quot;Contas conectadas&quot; antes de enviar.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs text-gray-200 hover:bg-card-hover"
                >
                  <input
                    type="radio"
                    name="drive-account"
                    checked={selected === account.id}
                    onChange={() => setSelected(account.id)}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  <span className="truncate">
                    {account.accountName}
                    {account.username ? ` · @${account.username.replace(/^@/, "")}` : ""}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-border px-4 py-2 text-sm text-gray-300 hover:bg-card-hover disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => selected && onConfirm(selected)}
            disabled={!selected || sending}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending && <Loader2 size={14} className="animate-spin" />}
            {sending && progressLabel ? progressLabel : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
