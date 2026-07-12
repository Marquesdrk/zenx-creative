import { SkeletonBlock } from "./skeleton-block";

export function EditorSkeleton() {
  return (
    <div data-testid="editor-skeleton">
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} className="aspect-[9/14]" />
        ))}
      </div>
    </div>
  );
}
