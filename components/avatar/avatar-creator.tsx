"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { createBlankProfile, useProfiles } from "@/lib/editor/profiles-store";
import { createDefaultTemplate, useTemplates } from "@/lib/editor/templates-store";
import { ENGINE_LABELS, type Engine } from "@/lib/editor/types";
import type { Avatar, AvatarPillar } from "@/lib/server/avatar-types";

const ENGINE_ORDER: Engine[] = ["REACT", "X_STYLE", "UGC"];

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const emptyPillar: AvatarPillar = { name: "", description: "", format: "" };

const DOCUMENT_LABELS: Record<keyof NonNullable<Avatar["documents"]>, string> = {
  purpose: "Propósito e nicho",
  toneAndRules: "Tom de voz e regras",
  pillars: "Pilares de conteúdo",
  visualBible: "Bíblia visual",
  voiceNotes: "Notas de voz",
  launchPlan: "Plano de lançamento",
  master: "Documento mestre",
};

const IMAGE_LABELS: Record<keyof NonNullable<Avatar["imageUrls"]>, string> = {
  characterBible: "Imagem-base (bíblia visual)",
  closeUp: "Close-up",
  turnaround: "Turnaround (4 ângulos)",
  expressions: "Folha de expressões",
};

export function AvatarCreator() {
  const [, setProfiles] = useProfiles();
  const [, setTemplates] = useTemplates();

  const [connections, setConnections] = useState<{ openai: boolean; drive: boolean } | null>(null);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState<Engine>("REACT");
  const [niche, setNiche] = useState("");
  const [painPoint, setPainPoint] = useState("");
  const [audience, setAudience] = useState("");
  const [promise, setPromise] = useState("");
  const [boundaries, setBoundaries] = useState("");
  const [toneAdjectives, setToneAdjectives] = useState("");
  const [alwaysRules, setAlwaysRules] = useState("");
  const [neverRules, setNeverRules] = useState("");
  const [signaturePhrase, setSignaturePhrase] = useState("");
  const [pillars, setPillars] = useState<AvatarPillar[]>([{ ...emptyPillar }]);
  const [visualStyle, setVisualStyle] = useState("");
  const [voiceNotes, setVoiceNotes] = useState("");

  const [step, setStep] = useState<"form" | "generating" | "ready">("form");
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileCreated, setProfileCreated] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/openai/status").then((res) => res.json()),
      fetch("/api/drive/status").then((res) => res.json()),
    ])
      .then(([openai, drive]: [{ connected: boolean }, { configured: boolean; connected: boolean }]) => {
        setConnections({ openai: openai.connected, drive: drive.connected });
      })
      .catch(() => setConnections({ openai: false, drive: false }));
  }, []);

  function updatePillar(index: number, patch: Partial<AvatarPillar>) {
    setPillars((current) => current.map((pillar, i) => (i === index ? { ...pillar, ...patch } : pillar)));
  }

  async function handleGenerate() {
    if (!name.trim() || !visualStyle.trim()) {
      setError("Preencha ao menos o nome e o estilo visual do personagem.");
      return;
    }
    setError(null);
    setStep("generating");

    const payload = {
      name,
      engine,
      niche,
      painPoint,
      audience,
      promise,
      boundaries: linesToList(boundaries),
      toneAdjectives: csvToList(toneAdjectives),
      alwaysRules: linesToList(alwaysRules),
      neverRules: linesToList(neverRules),
      signaturePhrase,
      pillars: pillars.filter((p) => p.name.trim()),
      visualStyle,
      voiceNotes,
    };

    const createRes = await fetch("/api/avatars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) {
      const data = await createRes.json().catch(() => ({}));
      setError(data.error || "Falha ao salvar o avatar.");
      setStep("form");
      return;
    }
    const created = (await createRes.json()) as Avatar;

    const generateRes = await fetch(`/api/avatars/${created.id}/generate`, { method: "POST" });
    const generated = (await generateRes.json().catch(() => null)) as Avatar | { error: string } | null;
    if (!generateRes.ok || !generated || "error" in generated) {
      setError((generated && "error" in generated && generated.error) || "Falha ao gerar o avatar.");
      setStep("form");
      return;
    }

    setAvatar(generated);
    setStep("ready");
  }

  function handleCreateProfile() {
    if (!avatar) return;
    const template = createDefaultTemplate(avatar.engine, `${avatar.name} — template`);
    setTemplates((current) => [...current, template]);
    const profile = createBlankProfile(avatar.engine, template.id);
    profile.name = avatar.name;
    if (profile.engine === "X_STYLE") {
      profile.handle = `@${avatar.name.toLowerCase().replace(/\s+/g, "")}`;
      profile.avatarUrl = avatar.imageUrls?.closeUp ?? null;
    }
    setProfiles((current) => [...current, profile]);
    void fetch(`/api/avatars/${avatar.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id }),
    });
    setProfileCreated(true);
  }

  if (step === "ready" && avatar) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          Avatar &quot;{avatar.name}&quot; gerado com sucesso. Documentos e imagens salvos em{" "}
          <span className="font-semibold">Avatares Criados/{avatar.name}</span> no seu Google Drive.
        </div>

        <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">Imagens geradas</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {avatar.imageUrls &&
              (Object.keys(IMAGE_LABELS) as Array<keyof typeof IMAGE_LABELS>).map((key) =>
                avatar.imageUrls?.[key] ? (
                  <a
                    key={key}
                    href={avatar.imageUrls[key]}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-border bg-card p-3 text-center text-xs text-muted hover:bg-card-hover"
                  >
                    {IMAGE_LABELS[key]}
                  </a>
                ) : null
              )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
          <p className="mb-3 text-sm font-semibold text-foreground">Kit de documentos</p>
          <div className="space-y-2">
            {avatar.documents &&
              (Object.keys(DOCUMENT_LABELS) as Array<keyof typeof DOCUMENT_LABELS>).map((key) => (
                <details key={key} className="rounded-lg border border-border bg-card p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-foreground">{DOCUMENT_LABELS[key]}</summary>
                  <pre className="mt-2 whitespace-pre-wrap text-xs text-muted">{avatar.documents?.[key]}</pre>
                </details>
              ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateProfile}
          disabled={profileCreated}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {profileCreated ? "Perfil criado ✓" : `Criar perfil ${ENGINE_LABELS[avatar.engine]} com este avatar`}
        </button>
        {profileCreated && (
          <p className="text-xs text-muted">
            Pronto — veja e ajuste em{" "}
            <a href="/templates" className="text-accent underline">
              Templates
            </a>
            .
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">
      {connections && (!connections.openai || !connections.drive) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          {!connections.openai && "Conecte a OpenAI "}
          {!connections.openai && !connections.drive && "e o "}
          {!connections.drive && "Google Drive "}
          em{" "}
          <a href="/configuracoes" className="underline">
            Configurações
          </a>{" "}
          antes de gerar — os documentos e imagens são gerados pela OpenAI e salvos no seu Drive.
        </div>
      )}

      <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Identidade e propósito</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do personagem">
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Ex: Guto" />
          </Field>
          <Field label="Engine do perfil final">
            <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} className={inputClass}>
              {ENGINE_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ENGINE_LABELS[option]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Nicho / tema central" className="mt-3">
          <input value={niche} onChange={(e) => setNiche(e.target.value)} className={inputClass} placeholder="Ex: Espiritismo segundo Kardec, explicado de forma acessível" />
        </Field>
        <Field label="Dor real que ele resolve" className="mt-3">
          <textarea value={painPoint} onChange={(e) => setPainPoint(e.target.value)} rows={2} className={inputClass} />
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Público (idade, momento de vida...)">
            <textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} className={inputClass} />
          </Field>
          <Field label="Promessa (uma frase)">
            <textarea value={promise} onChange={(e) => setPromise(e.target.value)} rows={2} className={inputClass} />
          </Field>
        </div>
        <Field label="Fronteiras — um assunto por linha, o que ele nunca aborda" className="mt-3">
          <textarea value={boundaries} onChange={(e) => setBoundaries(e.target.value)} rows={3} className={inputClass} />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Tom de voz e regras editoriais</p>
        <Field label="Adjetivos da voz, separados por vírgula">
          <input value={toneAdjectives} onChange={(e) => setToneAdjectives(e.target.value)} className={inputClass} placeholder="caloroso, responsável, esclarecedor" />
        </Field>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Sempre (um por linha)">
            <textarea value={alwaysRules} onChange={(e) => setAlwaysRules(e.target.value)} rows={3} className={inputClass} />
          </Field>
          <Field label="Nunca (um por linha)">
            <textarea value={neverRules} onChange={(e) => setNeverRules(e.target.value)} rows={3} className={inputClass} />
          </Field>
        </div>
        <Field label="Frase de assinatura (abertura/fechamento exclusivo)" className="mt-3">
          <input value={signaturePhrase} onChange={(e) => setSignaturePhrase(e.target.value)} className={inputClass} placeholder="Ex: Até a próxima" />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Bíblia visual</p>
        <Field label="Estilo, aparência, roupa, acessório distintivo, sensação que deve passar">
          <textarea
            value={visualStyle}
            onChange={(e) => setVisualStyle(e.target.value)}
            rows={4}
            className={inputClass}
            placeholder="Ex: render 3D estilizado Pixar/Disney, homem adulto, cabelo cacheado castanho, barba cheia, camisa xadrez verde-musgo, sensação acolhedora e confiável"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Pilares de conteúdo</p>
          <button
            type="button"
            onClick={() => setPillars((current) => [...current, { ...emptyPillar }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent"
          >
            <Plus size={13} /> Adicionar pilar
          </button>
        </div>
        <div className="space-y-3">
          {pillars.map((pillar, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_2fr_1fr_auto]">
              <input value={pillar.name} onChange={(e) => updatePillar(index, { name: e.target.value })} placeholder="Nome" className={inputClass} />
              <input value={pillar.description} onChange={(e) => updatePillar(index, { description: e.target.value })} placeholder="Descrição" className={inputClass} />
              <input value={pillar.format} onChange={(e) => updatePillar(index, { format: e.target.value })} placeholder="Formato de vídeo" className={inputClass} />
              <button
                type="button"
                onClick={() => setPillars((current) => current.filter((_, i) => i !== index))}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-[#0d0d0d] p-5">
        <p className="mb-3 text-sm font-semibold text-foreground">Voz sonora</p>
        <Field label="Notas livres (tom, ritmo, energia — ex: voz do ElevenLabs já escolhida)">
          <textarea value={voiceNotes} onChange={(e) => setVoiceNotes(e.target.value)} rows={2} className={inputClass} />
        </Field>
      </div>

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={step === "generating"}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {step === "generating" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {step === "generating" ? "Gerando documentos e imagens…" : "Gerar avatar com IA"}
      </button>
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-xs font-semibold text-muted ${className ?? ""}`}>
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}
