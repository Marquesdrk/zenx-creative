import { PerformanceSkeleton } from "@/components/skeletons/performance-skeleton";

export default function PerformancePage() {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Performance dos perfis</h1>
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          Exportar relatório
        </button>
      </div>
      <p className="mb-8 text-sm text-muted">
        Acompanhe o desempenho dos seus perfis e conteúdos.
      </p>
      <PerformanceSkeleton />
    </div>
  );
}
