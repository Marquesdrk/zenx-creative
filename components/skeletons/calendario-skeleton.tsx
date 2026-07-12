import { SkeletonBlock } from "./skeleton-block";

export function CalendarioSkeleton() {
  return (
    <div data-testid="calendario-skeleton" className="grid grid-cols-7 gap-2">
      {Array.from({ length: 28 }).map((_, i) => (
        <SkeletonBlock key={i} className="aspect-square" />
      ))}
    </div>
  );
}
