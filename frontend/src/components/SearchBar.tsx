import { FormEvent, useState } from "react";

interface Props {
  onSearch: (keyword: string) => void;
  initialValue?: string;
}

export default function SearchBar({ onSearch, initialValue = "" }: Props) {
  const [value, setValue] = useState(initialValue);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.35 4.35a7.5 7.5 0 0012.3 12.3z"
          />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search existing discussions before posting a new question…"
          className="w-full rounded-full border border-line bg-white py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-slate/70 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/20"
        />
      </div>
      <button
        type="submit"
        className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-parchment transition-opacity hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}
