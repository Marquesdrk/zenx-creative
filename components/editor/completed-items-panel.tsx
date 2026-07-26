"use client";

import { useState } from "react";
import { PLATFORM_LABELS, type Batch, type BatchItem, type Platform, type Profile } from "@/lib/editor/types";

const PLATFORMS: Platform[] = ["INSTAGRAM", "FACEBOOK", "YOUTUBE", "TIKTOK", "KWAI"];

type PublishState = { status: "loading" | "done" | "error"; message?: string };

export function CompletedItemsPanel({
  items,
  batches,
  profiles,
}: {
  items: BatchItem[];
  batches: Batch[];
  profiles: Profile[];
}) {
  const [publishState, setPublishState] = useState<Record<string, PublishState>>({});

  if (items.length === 0) return null;

  async function handlePublish(itemId: string, platform: Platform) {
    const key = `${itemId}:${platform}`;
    setPublishState((current) => ({ ...current, [key]: { status: "loading" } }));
    try {
      const res = await fetch("/api/publications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchItemId: itemId, platform }),
      });
      const data = (await res.json()) as { status: string; error: string | null };
      setPublishState((current) => ({
        ...current,
        [key]:
          data.status === "PUBLISHED"
            ? { status: "done" }
            : { status: "error", message: data.error ?? "Falha ao publicar" },
      }));
    } catch {
      setPublishState((current) => ({ ...current, [key]: { status: "error", message: "Falha de rede" } }));
    }
  }

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Renderizados — prontos para publicar</h2>
      <div className="flex flex-col gap-2">
        {items.map((item) => {
          const batch = batches.find((b) => b.id === item.batchId);
          const profile = batch ? profiles.find((p) => p.id === batch.profileId) : null;
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{item.filename}</p>
                <p className="truncate text-[11px] text-muted">{profile?.name ?? "Perfil removido"}</p>
              </div>
              {item.renderedUrl && (
                <a
                  href={item.renderedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent hover:underline"
                >
                  Ver render
                </a>
              )}
              <div className="flex flex-wrap gap-1.5">
                {PLATFORMS.map((platform) => {
                  const state = publishState[`${item.id}:${platform}`];
                  return (
                    <button
                      key={platform}
                      type="button"
                      title={state?.status === "error" ? state.message : undefined}
                      disabled={state?.status === "loading" || state?.status === "done"}
                      onClick={() => handlePublish(item.id, platform)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] disabled:cursor-not-allowed ${
                        state?.status === "done"
                          ? "border-[#4CD18A]/40 bg-[#4CD18A]/15 text-[#4CD18A]"
                          : state?.status === "error"
                            ? "border-red-500/40 bg-red-500/15 text-red-400"
                            : "border-border bg-background text-gray-300 hover:bg-card-hover"
                      }`}
                    >
                      {state?.status === "loading"
                        ? "Publicando…"
                        : state?.status === "done"
                          ? `${PLATFORM_LABELS[platform]} ✓`
                          : state?.status === "error"
                            ? `${PLATFORM_LABELS[platform]} ✕`
                            : PLATFORM_LABELS[platform]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
