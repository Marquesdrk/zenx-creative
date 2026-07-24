import { CalendarioSkeleton } from "@/components/skeletons/calendario-skeleton";

export default function CalendarioPage() {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Calendário de postagem</h1>
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          + Agendar post
        </button>
      </div>
      <p className="mb-8 text-sm text-muted">
        Visualize, edite e organize todas as suas publicações.
      </p>
      <CalendarioSkeleton />
    </div>
  );
}
