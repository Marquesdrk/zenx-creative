"use client";

import { AtSign, Flag, RefreshCw, Unlink } from "lucide-react";
import type { PublicSocialAccount, SocialAccountStatus } from "@/lib/server/meta/types";

const STATUS_LABEL: Record<SocialAccountStatus, string> = {
  connected: "Conectado",
  expired: "Expirado",
  revoked: "Revogado",
  error: "Erro",
};

const STATUS_CLASS: Record<SocialAccountStatus, string> = {
  connected: "bg-[#4CD18A]/15 text-[#4CD18A]",
  expired: "bg-amber-500/15 text-amber-300",
  revoked: "bg-red-500/15 text-red-300",
  error: "bg-red-500/15 text-red-300",
};

export function SocialAccountRow({
  account,
  onDisconnect,
  busy,
}: {
  account: PublicSocialAccount;
  onDisconnect: (id: string) => void;
  busy: boolean;
}) {
  const Icon = account.platform === "INSTAGRAM" ? AtSign : Flag;
  const needsReconnect = account.status !== "connected";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-hover">
          {account.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- avatar remoto da Meta, fora do domínio de imagens do Next
            <img src={account.profilePictureUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon size={16} className="text-muted" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{account.accountName}</p>
          <p className="truncate text-xs text-muted">
            {account.username
              ? `@${account.username.replace(/^@/, "")}`
              : account.platform === "FACEBOOK"
                ? "Página do Facebook"
                : ""}
          </p>
          {needsReconnect && account.lastError && (
            <p className="mt-0.5 truncate text-[11px] text-red-300">{account.lastError}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CLASS[account.status]}`}>
          {STATUS_LABEL[account.status]}
        </span>
        {needsReconnect && (
          <a
            href="/api/meta/auth"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-[#171717] px-2 text-[11px] font-semibold text-gray-200 hover:bg-card-hover"
          >
            <RefreshCw size={12} />
            Reconectar
          </a>
        )}
        <button
          type="button"
          onClick={() => onDisconnect(account.id)}
          disabled={busy}
          aria-label={`Desconectar ${account.accountName}`}
          className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-gray-400 hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Unlink size={14} />
        </button>
      </div>
    </div>
  );
}
