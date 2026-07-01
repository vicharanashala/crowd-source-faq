// ContextFieldsDisplay — read-only rendering of a ticket's
// `contextFields` array. Used in the admin ticket view. Renders each
// `{key, label, value}` triple as a labelled row. If a value is the
// archived field's persisted value, the label gets a small "(archived)"
// badge so the admin knows.

import React from 'react';
import type {
  SupportContextFieldValue,
  SupportCategory,
} from './types';

export function ContextFieldsDisplay({
  values,
  category,
}: {
  values: SupportContextFieldValue[];
  category?: SupportCategory | null;
}): React.ReactElement | null {
  if (!values || values.length === 0) return null;

  // Build a set of "active" keys (non-archived fields in the live schema)
  // for the "(archived)" badge.
  const activeKeys = new Set(
    (category?.fields ?? [])
      .filter((f) => !f.archived)
      .map((f) => f.key),
  );

  return (
    <section className="admin-card-surface p-5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-faint mb-3">
        Provided context ({values.length})
      </p>
      <dl className="space-y-2.5">
        {values.map((v, i) => {
          const isArchived = !activeKeys.has(v.key);
          const isEmpty = v.value === null || v.value === '' || v.value === undefined;
          return (
            <div
              key={v.key + i}
              className="grid grid-cols-3 gap-2 items-start text-sm"
            >
              <dt className="col-span-1 text-ink-soft flex items-center gap-1.5">
                {v.label || v.key}
                {isArchived && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded uppercase tracking-wider font-semibold bg-mist text-ink-faint"
                    title="This field has been archived since the ticket was submitted."
                  >
                    archived
                  </span>
                )}
              </dt>
              <dd className="col-span-2 text-ink break-words">
                {isEmpty ? <em className="text-ink-faint">not provided</em> : formatValue(v.value)}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function formatValue(v: string | number | boolean | null): React.ReactElement {
  if (v === null || v === undefined || v === '') {
    return <em className="text-ink-faint">not provided</em>;
  }
  if (typeof v === 'boolean') {
    return v ? <span className="text-success">✓ Yes</span> : <span className="text-ink-faint">No</span>;
  }
  if (typeof v === 'number') {
    return <span className="tabular-nums">{v}</span>;
  }
  // String — format dates as locale strings if they parse as one
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(v + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      return <span className="tabular-nums">{d.toLocaleDateString()}</span>;
    }
  }
  return <span className="whitespace-pre-wrap">{v}</span>;
}
