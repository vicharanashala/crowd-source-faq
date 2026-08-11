// ImportantLinks — "Important Links" tab of the Community Pinboard.
//
// Owned by: Member 6 (community-pinboard/links)
//
// Renders a responsive grid of curated external links (title,
// description, URL). For now the list is backed by a small local
// sample dataset kept private to this module — see SAMPLE_LINKS
// below — so the component has zero external/API dependencies.
//
// Swapping to real data later only requires replacing SAMPLE_LINKS
// with fetched data of the same `ImportantLink` shape (or accepting
// it via props) — nothing else in this component needs to change.

import React from 'react';
import Card from '../../../ui/Card';
import {
  textHeaderSm,
  textBodySoft,
  textLabelXsBold,
} from '../../../../styles/typography';
import { btnSecondary } from '../../../../styles/controls';

// ── Local, isolated sample data ────────────────────────────────────
// Intentionally NOT exported: this keeps the data private to the
// module so a future API-backed version can drop this block in and
// swap it for fetched data without touching the render logic below.
interface ImportantLink {
  id: string;
  title: string;
  description: string;
  url: string;
}

const SAMPLE_LINKS: ImportantLink[] = [
  {
    id: 'sample-1',
    title: 'Program Handbook',
    description: 'Policies, timelines, and expectations for the current cohort.',
    url: 'https://example.com/handbook',
  },
  {
    id: 'sample-2',
    title: 'Internship Portal',
    description: 'Submit weekly reports and track your internship milestones.',
    url: 'https://example.com/portal',
  },
  {
    id: 'sample-3',
    title: 'Community Code of Conduct',
    description: 'Guidelines every member agrees to when posting or commenting.',
    url: 'https://example.com/code-of-conduct',
  },
];

// ── Icons (inline SVG, matching repo convention — no icon package) ─
function ExternalLinkIcon(): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function LinksEmptyIcon(): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 17H7a5 5 0 1 1 0-10h2" />
      <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ── Empty state ──────────────────────────────────────────────────
function ImportantLinksEmptyState(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4 min-h-[160px]">
      <div className="w-10 h-10 rounded-full bg-mist flex items-center justify-center mb-3 text-ink-faint">
        <LinksEmptyIcon />
      </div>
      <p className="text-sm font-medium text-ink">No important links yet</p>
      <p className="text-xs text-ink-soft mt-1">
        Check back later — useful links shared with the community will show up here.
      </p>
    </div>
  );
}

// ── Single link card ─────────────────────────────────────────────
function ImportantLinkCard({ link }: { link: ImportantLink }): React.ReactElement {
  return (
    <Card variant="default" className="p-4 flex flex-col gap-2 h-full">
      <h3 className={textHeaderSm}>{link.title}</h3>
      <p className={`${textBodySoft} leading-relaxed flex-1`}>{link.description}</p>
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${link.title} in a new tab`}
        className={`${btnSecondary} self-start mt-1 text-xs px-3 py-1.5`}
      >
        Visit link
        <ExternalLinkIcon />
      </a>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function ImportantLinks(): React.ReactElement {
  const links = SAMPLE_LINKS;

  return (
    <section aria-labelledby="important-links-heading">
      <h2 id="important-links-heading" className={textLabelXsBold}>
        Important Links
      </h2>

      {links.length === 0 ? (
        <ImportantLinksEmptyState />
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((link) => (
            <ImportantLinkCard key={link.id} link={link} />
          ))}
        </div>
      )}
    </section>
  );
}
