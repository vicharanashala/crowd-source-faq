"use client";

interface Cat { val: string; label: string; }

interface PillsFilterProps {
  cats: Cat[];
  activeCat: string;
  onCatChange: (val: string) => void;
}

export default function PillsFilter({ cats, activeCat, onCatChange }: PillsFilterProps) {
  return (
    <div className="pills-section">
      <div className="pills-label">Browse by category</div>
      <div className="pills-row">
        {cats.map((c) => (
          <button
            key={c.val}
            className={`pill${activeCat === c.val ? " active" : ""}`}
            onClick={() => onCatChange(c.val)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
