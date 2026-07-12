import { EditorSkeleton } from "@/components/skeletons/editor-skeleton";

export default function EditorPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Editor em massa</h1>
      <p className="mb-8 mt-1 text-sm text-muted">
        Importe e edite vídeos em massa: marca d&apos;água, legendas e templates automáticos.
      </p>
      <EditorSkeleton />
    </div>
  );
}
