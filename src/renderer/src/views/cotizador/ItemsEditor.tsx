import React from 'react';
import { Plus, Trash2, Calculator } from 'lucide-react';
import type { Categoria, Tienda } from '../../../../shared/types';
import type { ResultadoCotizacionCompleta } from '@core/precios';
import type { DraftItem } from './useCotizacionDraft';
import {
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  Field,
  Input,
  Select,
  Button,
  Money,
} from '../../components/ui';

export interface ItemsEditorProps {
  draftItems: DraftItem[];
  calculo: ResultadoCotizacionCompleta | null;
  categorias: Categoria[];
  tiendas: Tienda[];
  onAddItem: () => void;
  onUpdateItem: <K extends keyof DraftItem>(id: string, field: K, value: DraftItem[K]) => void;
  onRemoveItem: (id: string) => void;
}

export const ItemsEditor: React.FC<ItemsEditorProps> = ({
  draftItems,
  calculo,
  categorias,
  tiendas,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}) => {
  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={Calculator}
          title={`Productos a Cotizar (${draftItems.length})`}
          action={
            <Button size="sm" variant="ghost" onClick={onAddItem}>
              <Plus className="w-3.5 h-3.5 mr-1" />
              <span>Agregar otro producto</span>
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {draftItems.map((item, idx) => (
          <div
            key={item.id}
            className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-label text-slate-400 font-medium shrink-0">
                #{idx + 1}
              </span>
              <Input
                value={item.descripcion}
                onChange={(e) => onUpdateItem(item.id, 'descripcion', e.target.value)}
                placeholder="Descripción del producto (ej: Tenis Nike Air Max)"
                className="flex-1"
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemoveItem(item.id)}
                className="text-slate-400 hover:text-danger-500 p-2"
                title="Eliminar producto"
                aria-label="Eliminar producto"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {/* Tienda */}
              <Field label="Tienda USA">
                <Select
                  value={item.tienda_id ?? ''}
                  onChange={(e) =>
                    onUpdateItem(
                      item.id,
                      'tienda_id',
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                >
                  <option value="">(Sin tienda)</option>
                  {tiendas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} {t.tax_rate_bp === 0 ? '(0% Tax)' : '(7% Tax)'}
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Categoría */}
              <Field label="Categoría">
                <Select
                  value={item.categoria_id ?? ''}
                  onChange={(e) =>
                    onUpdateItem(
                      item.id,
                      'categoria_id',
                      e.target.value ? Number(e.target.value) : undefined
                    )
                  }
                >
                  <option value="">(Sin categoría)</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.comision_defecto_bp / 100}%)
                    </option>
                  ))}
                </Select>
              </Field>

              {/* Precio USA */}
              <Field label="Precio USA ($)">
                <Input
                  type="number"
                  step="0.01"
                  value={item.precio_usa_usd}
                  onChange={(e) => onUpdateItem(item.id, 'precio_usa_usd', e.target.value)}
                  placeholder="0.00"
                  className="text-right font-medium"
                />
              </Field>

              {/* Peso en Libras */}
              <Field label="Peso (lb)">
                <Input
                  type="number"
                  step="0.1"
                  value={item.peso_lb}
                  onChange={(e) => onUpdateItem(item.id, 'peso_lb', e.target.value)}
                  placeholder="1.00"
                  className="text-right font-medium"
                />
              </Field>
            </div>

            {/* Resultado calculado por ítem */}
            {calculo && calculo.items[idx] && (
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-caption">
                <div className="text-slate-500">
                  Costo aterrizado est: $
                  {(
                    calculo.items[idx].costo_aterrizado_estimado_usd_cents / 100
                  ).toFixed(2)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Precio final sugerido:</span>
                  <Money
                    cor_cents={calculo.items[idx].precio_final_cor_cents}
                    usd_cents={calculo.items[idx].precio_final_usd_cents}
                    size="sm"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
