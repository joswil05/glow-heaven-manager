import React from 'react';
import { cn } from '../../lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  width?: string;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  selectedKey?: string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onRowClick,
  emptyMessage = 'No hay nada que mostrar.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="bg-superficie rounded-lg border border-borde p-8 text-center text-body text-texto-3">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-superficie rounded-lg border border-borde overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-borde">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-texto-3',
                  col.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-borde last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-superficie-2',
                  selectedKey === key && 'bg-acento-suave hover:bg-acento-suave'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 text-body text-texto-2',
                      col.align === 'right' && 'text-right tabular'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
