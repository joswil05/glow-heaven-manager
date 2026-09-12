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
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onRowClick,
  onRowContextMenu,
  emptyMessage = 'No hay nada que mostrar.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="bg-superficie rounded-2xl border border-dashed border-borde p-10 text-center text-body text-texto-3 shadow-xs">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-superficie rounded-2xl border border-borde shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-borde bg-superficie-2/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-texto-3 select-none',
                    col.align === 'right' ? 'text-right' : 'text-left'
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-borde/70">
            {rows.map((row) => {
              const key = rowKey(row);
              const esSeleccionado = selectedKey === key;
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onContextMenu={
                    onRowContextMenu
                      ? (e) => {
                          e.preventDefault();
                          onRowContextMenu(row, e);
                        }
                      : undefined
                  }
                  className={cn(
                    'transition-colors duration-150',
                    onRowClick && 'cursor-pointer',
                    esSeleccionado
                      ? 'bg-acento-suave/80 hover:bg-acento-suave'
                      : onRowClick
                        ? 'hover:bg-superficie-2/50'
                        : ''
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-body text-texto-2',
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
    </div>
  );
}
