import { SkeletonBlock } from "./skeleton-block";

export function BibliotecaSkeleton() {
  return (
    <div data-testid="biblioteca-skeleton" className="grid grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonBlock key={i} className="aspect-[9/14]" />
      ))}
    </div>
  );
}
