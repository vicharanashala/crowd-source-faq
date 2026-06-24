import React from 'react';
import { SearchX, FileQuestion, Inbox } from 'lucide-react';

const presets = {
  search: {
    icon: SearchX,
    title: 'No FAQs Found',
    description: 'Try different keywords or browse sections below',
  },
  faq: {
    icon: FileQuestion,
    title: 'No Questions Here',
    description: 'This section is being updated. Check back soon.',
  },
  default: {
    icon: Inbox,
    title: 'Nothing Here Yet',
    description: 'Content will appear once available',
  },
};

export default function EmptyState({ variant = 'default', title, description }) {
  const preset = presets[variant] || presets.default;
  const Icon = preset.icon;
  const displayTitle = title || preset.title;
  const displayDesc = description || preset.description;

  return (
    <div className="empty-state flex flex-col items-center justify-center py-10 px-4 text-center">
      <div className="empty-state-icon mb-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
          <Icon size={28} className="text-slate-300" strokeWidth={1.5} />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-700">{displayTitle}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">{displayDesc}</p>
    </div>
  );
}
