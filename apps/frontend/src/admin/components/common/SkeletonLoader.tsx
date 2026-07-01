import type { CSSProperties } from 'react';

interface SkeletonProps { className?: string; style?: CSSProperties; }

function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`rounded bg-mist animate-pulse ${className}`} style={style} />;
}

export function StatsCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <Skeleton className="w-16 h-7 mb-2" />
      <Skeleton className="w-24 h-3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-lg">
          <Skeleton className="w-5 h-5 rounded shrink-0" />
          <Skeleton className="flex-1 h-3.5 rounded" />
          <Skeleton className="w-16 h-5 rounded-md shrink-0" />
          <Skeleton className="w-12 h-3.5 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return <Skeleton className="w-full rounded-xl" style={{ height }} />;
}

export default Skeleton;
