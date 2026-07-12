import { SkeletonBlock } from "./skeleton-block";

export function PerformanceSkeleton() {
  return (
    <div data-testid="performance-skeleton">
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
      <SkeletonBlock className="h-56" />
    </div>
  );
}
