"use client";

import { useEffect, useState } from "react";
import { Camera, Link2, Plus } from "lucide-react";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { createBlankProfile, useProfiles } from "@/lib/editor/profiles-store";
import { createDefaultTemplate, useTemplates } from "@/lib/editor/templates-store";
import { ENGINE_LABELS, type Engine, type Profile } from "@/lib/editor/types";
import type { PublicSocialAccount } from "@/lib/server/meta/types";

const ACCEPT_INVITE_URL = "https://www.instagram.com/accounts/manage_access/";

export function MetaProfileSettings() {
  const [profiles, setProfiles] = useProfiles();
  const [templates, setTemplates] = useTemplates();
  const [accounts, setAccounts] = useState<PublicSocialAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);

  useEffect(() => {
    void fetch("/api/meta/accounts")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: PublicSocialAccount[]) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  const selectedProfile = profiles.find((profile) => profile.id === selectedId) ?? profiles[0] ?? null;
  const connectedHandles = new Set(accounts.filter((account) => account.platform === "INSTAGRAM").map((account) => account.username?.toLowerCase()));

  function addProfile(engine: Engine) {
    const template = createDefaultTemplate(engine, `Padrão — novo perfil ${ENGINE_LABELS[engine]}`);
    setTemplates((current) => [...current, template]);
    const profile = createBlankProfile(engine, template.id);
    setProfiles((current) => [...current, profile]);
    setSelectedId(profile.id);
    setShowAddMenu(false);
  }

  function updateProfile(updated: Profile) {
    setProfiles((current) => current.map((profile) => (profile.id === updated.id ? updated : profile)));
  }

  function deleteProfile() {
    if (!selectedProfile || profiles.length <= 1) return;
    setProfiles((current) => current.filter((profile) => profile.id !== selectedProfile.id));
    setTemplates((current) => current.filter((template) => template.id !== selectedProfile.templateId));
    setSelectedId(null);
  }

  async function copyInviteLink() {
    await navigator.clipboard.writeText(ACCEPT_INVITE_URL);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }

  async function copyHandle() {
    if (!selectedProfile?.handle) return;
    await navigator.clipboard.writeText(selectedProfile.handle);
    setHandleCopied(true);
    window.setTimeout(() => setHandleCopied(false), 2200);
  }

  return (
    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Camera size={16} className="text-pink-300" /> Perfis e convites do Instagram
          </p>
          <p className="mt-1 max-w-2xl text-xs text-muted">
            Cadastre o nome e o @ de cada perfil antes de conectar. Depois aceite o convite do aplicativo no Instagram e conecte a conta correspondente.
          </p>
        </div>
        <div className="relative">
          <button type="button" onClick={() => setShowAddMenu((current) => !current)} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background">
            <Plus size={14} /> Adicionar perfil
          </button>
          {showAddMenu && (
            <div className="absolute right-0 z-10 mt-2 w-44 rounded-lg border border-border bg-[#171717] p-1.5 shadow-xl">
              {(["REACT", "X_STYLE", "UGC"] as Engine[]).map((engine) => (
                <button key={engine} type="button" onClick={() => addProfile(engine)} className="block w-full rounded-md px-3 py-2 text-left text-xs text-gray-200 hover:bg-card-hover">
                  {ENGINE_LABELS[engine]}
                  <span className="ml-1 text-[10px] text-muted">· Instagram</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {profiles.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-xs text-muted">
          Nenhum perfil cadastrado. Clique em “Adicionar perfil” para começar.
        </div>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="flex flex-col gap-2">
            {profiles.map((profile) => {
              const handle = profile.handle?.replace(/^@/, "").toLowerCase() || null;
              const connected = Boolean(handle && connectedHandles.has(handle));
              return (
                <button key={profile.id} type="button" onClick={() => setSelectedId(profile.id)} className={`rounded-lg border p-3 text-left ${selectedProfile?.id === profile.id ? "border-accent bg-accent/10" : "border-border bg-background"}`}>
                  <p className="truncate text-sm font-semibold text-foreground">{profile.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">{handle ? `@${handle}` : ENGINE_LABELS[profile.engine]}</p>
                  <p className={`mt-2 text-[10px] font-semibold ${connected ? "text-emerald-300" : "text-amber-300"}`}>{connected ? "Conectado" : "Aguardando conexão"}</p>
                </button>
              );
            })}
          </div>

          {selectedProfile && (
            <div className="min-w-0">
              <ProfileSettingsForm
                profile={selectedProfile}
                template={templates.find((template) => template.id === selectedProfile.templateId) ?? null}
                onChangeProfile={updateProfile}
                onChangeTemplate={(updated) => setTemplates((current) => current.map((template) => (template.id === updated.id ? updated : template)))}
                onDelete={deleteProfile}
                canDelete={profiles.length > 1}
              />

              {selectedProfile.handle && (
                <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4">
                  <p className="text-xs font-semibold text-foreground">Próximo passo para @{selectedProfile.handle.replace(/^@/, "")}</p>
                  <p className="mt-1 text-[11px] text-muted">Primeiro envie o convite no painel da Meta usando este @. Depois abra o link de aceite no navegador da conta convidada.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href="/api/meta/instagram/invite-dashboard" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-background">
                      <Camera size={13} /> Enviar convite no painel Meta
                    </a>
                    <button type="button" onClick={() => void copyHandle()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground">
                      <Link2 size={13} /> {handleCopied ? "@ copiado" : "Copiar @ para o convite"}
                    </button>
                    <button type="button" onClick={() => void copyInviteLink()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground">
                      <Link2 size={13} /> {copied ? "Link copiado" : "Copiar link do convite"}
                    </button>
                    <a href="/api/meta/instagram/auth" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-background">
                      <Camera size={13} /> Conectar conta no aplicativo
                    </a>
                  </div>
                  <p className="mt-2 break-all text-[10px] text-muted">{ACCEPT_INVITE_URL}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
