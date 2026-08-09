/**
 * ImportantLinksTab.tsx — Top-level Important Links tab.
 *
 * Composes:
 *  - `CategoryFilter` for frontend-only category filtering
 *  - `LinkCard` grid for display
 *  - `ManageLinksModal` (admin-only) for Add/Edit/Delete
 *
 * No backend, no API calls, no routing here. `links` is supplied by the
 * parent (whoever owns fetching data later); this component only holds
 * transient UI state — the selected category filter and whether the
 * manage modal is open — and forwards Add/Edit/Delete intent upward via
 * `onAddLink` / `onEditLink` / `onDeleteLink`.
 *
 * Admin gating mirrors the pattern used in `AdminControls`
 * (community/moderation): pass `isAdmin` explicitly, or let it fall back
 * to `useAuth()`.
 */

import React, { useMemo, useState } from 'react';
import Button from '../../ui/Button';
import { useIsCommunityAdmin } from '../moderation/useIsCommunityAdmin';
import { textHeaderMd, textBodyFaint } from '../../../styles/style_config';
import CategoryFilter, { type CategoryFilterValue } from './CategoryFilter';
import LinkCard from './LinkCard';
import ManageLinksModal from './ManageLinksModal';
import type { ImportantLink, ImportantLinkDraft } from './types';

export interface ImportantLinksTabProps {
  links: ImportantLink[];
  isAdmin?: boolean;
  /** Naming matches ManageLinksModal's onAdd/onEdit/onDelete — this component is a thin pass-through to it. */
  onAdd: (draft: ImportantLinkDraft) => void;
  onEdit: (id: string, draft: ImportantLinkDraft) => void;
  onDelete: (id: string) => void;
  onOpenLink?: (link: ImportantLink) => void;
  /** Passed through to ManageLinksModal while a parent-owned save is in flight. */
  saving?: boolean;
  className?: string;
}

export default function ImportantLinksTab({
  links,
  isAdmin,
  onAdd,
  onEdit,
  onDelete,
  onOpenLink,
  saving = false,
  className = '',
}: ImportantLinksTabProps) {
  const resolvedIsAdmin = useIsCommunityAdmin(isAdmin);

  const [selectedCategory, setSelectedCategory] = useState<CategoryFilterValue>('All');
  const [manageOpen, setManageOpen] = useState(false);

  const filteredLinks = useMemo(
    () =>
      selectedCategory === 'All'
        ? links
        : links.filter((link) => link.category === selectedCategory),
    [links, selectedCategory]
  );

  return (
    <div className={`space-y-5 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className={textHeaderMd}>Important Links</h2>
          <p className={textBodyFaint}>Quick access to docs, tools, and resources.</p>
        </div>
        {resolvedIsAdmin && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setManageOpen(true)}>
            <span aria-hidden="true">⚙️</span>
            <span>Manage Links</span>
          </Button>
        )}
      </div>

      <CategoryFilter selected={selectedCategory} onChange={setSelectedCategory} />

      {filteredLinks.length === 0 ? (
        <p className="text-sm text-ink-faint text-center py-10">
          No links in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLinks.map((link) => (
            <LinkCard key={link.id} link={link} onOpen={onOpenLink} />
          ))}
        </div>
      )}

      {resolvedIsAdmin && (
        <ManageLinksModal
          open={manageOpen}
          links={links}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setManageOpen(false)}
          saving={saving}
        />
      )}
    </div>
  );
}
