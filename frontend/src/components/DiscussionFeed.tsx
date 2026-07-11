import { Discussion } from "../types";
import DiscussionCard from "./DiscussionCard";

interface Props {
  discussions: Discussion[];
  loading: boolean;
  error: string | null;
}

export default function DiscussionFeed({ discussions, loading, error }: Props) {
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-card border border-line bg-white/60"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-clay/30 bg-clay/5 p-6 text-sm text-clay">
        {error}
      </div>
    );
  }

  if (discussions.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-white/50 p-10 text-center">
        <p className="font-display text-lg text-ink">No discussions yet</p>
        <p className="mt-1 text-sm text-slate">
          Be the first to start one — someone else probably has the same question.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {discussions.map((d) => (
        <DiscussionCard key={d._id} discussion={d} />
      ))}
    </div>
  );
}
