import { BibliotecaSkeleton } from "@/components/skeletons/biblioteca-skeleton";

export default function BibliotecaPage() {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Biblioteca de vídeos</h1>
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background"
        >
          + Enviar vídeo
        </button>
      </div>
      <p className="mb-8 text-sm text-muted">
        Gerencie, organize e utilize seus vídeos em todos os seus projetos.
      </p>
      <BibliotecaSkeleton />
    </div>
  );
}
