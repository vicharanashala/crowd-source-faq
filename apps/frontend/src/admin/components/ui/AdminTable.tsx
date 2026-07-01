import React, { type ReactNode } from 'react';

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T, index: number) => ReactNode;
  className?: string;
  width?: string;
}

interface AdminTableProps<T> {
  columns: Column<T>[];
  data: T[];
  empty?: string;
  rowKey?: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function AdminTable<T extends Record<string, unknown>>({
  columns,
  data,
  empty = 'No data',
  rowKey,
  onRowClick,
  className = '',
}: AdminTableProps<T>) {
  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2.5 text-left text-[10px] font-semibold text-ink-faint uppercase tracking-widest whitespace-nowrap"
                  style={{ width: col.width }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-ink-faint">
                  {empty}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={rowKey ? rowKey(row) : i}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'cursor-pointer hover:bg-mist transition-colors' : ''}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-ink">
                      {col.render
                        ? col.render(row, i)
                        : (row[col.key] as ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}