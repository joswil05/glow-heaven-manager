import React, { useState, useEffect } from 'react';
import type { Categoria } from '../../../../shared/types';
import type { CategoriaCambio } from '../../../../shared/ipc-contracts';
import { parsearACentavos } from '@core/numeros';
import { useToast } from '../../context/ToastContext';
import { Card, CardHeader, CardContent, SectionHeader, Button, Input } from '../../components/ui';
import { Percent, Save } from 'lucide-react';

interface CategoriasSectionProps {
  categorias: Categoria[];
  onRefresh: () => void;
}

interface CategoriaDraftRow {
  comision_pct: string;
  arancel_pct: string;
  redondeo_cor: string;
}

export const CategoriasSection: React.FC<CategoriasSectionProps> = ({
  categorias,
  onRefresh,
}) => {
  const { showToast, showUndoToast } = useToast();
  const [draft, setDraft] = useState<Record<number, CategoriaDraftRow>>({});
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const initial: Record<number, CategoriaDraftRow> = {};
    for (const cat of categorias) {
      initial[cat.id] = {
        comision_pct: (cat.comision_defecto_bp / 100).toString(),
        arancel_pct: (cat.arancel_estimado_bp / 100).toString(),
        redondeo_cor: (cat.redondeo_cor_cents / 100).toString(),
      };
    }
    setDraft(initial);
  }, [categorias]);

  const handleChange = (
    id: number,
    field: keyof CategoriaDraftRow,
    value: string
  ) => {
    setDraft((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || { comision_pct: '0', arancel_pct: '0', redondeo_cor: '0' }),
        [field]: value,
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cambios: CategoriaCambio[] = [];

    for (const cat of categorias) {
      const row = draft[cat.id];
      if (!row) continue;

      const comisionBp = parsearACentavos(row.comision_pct, { min: 0, max: 100 });
      if (comisionBp === null) {
        showToast({
          message: `Revisá la comisión de "${cat.nombre}": escribí un número entre 0 y 100.`,
          type: 'error',
        });
        return;
      }

      const arancelBp = parsearACentavos(row.arancel_pct, { min: 0, max: 100 });
      if (arancelBp === null) {
        showToast({
          message: `Revisá el arancel de "${cat.nombre}": escribí un número entre 0 y 100.`,
          type: 'error',
        });
        return;
      }

      const redondeoCents = parsearACentavos(row.redondeo_cor, { min: 0, max: 10000 });
      if (redondeoCents === null) {
        showToast({
          message: `Revisá el redondeo de "${cat.nombre}": escribí un número válido en córdobas.`,
          type: 'error',
        });
        return;
      }

      cambios.push({
        id: cat.id,
        comision_defecto_bp: comisionBp,
        arancel_estimado_bp: arancelBp,
        redondeo_cor_cents: redondeoCents,
      });
    }

    try {
      setGuardando(true);
      const res = await window.api.categorias.update(cambios);
      if (res.success) {
        showUndoToast('Tasas de categorías actualizadas', () => onRefresh());
        onRefresh();
      } else {
        showToast({
          message: res.error.message || 'Error al actualizar las categorías',
          type: 'error',
        });
      }
    } catch {
      showToast({ message: 'Error de conexión al actualizar categorías', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={Percent}
          title="Categorías y Ganancia"
          description="Ajustá comisiones, aranceles estimados y redondeos por categoría de producto."
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-body text-slate-600">
          La comisión es tu ganancia y se calcula sobre el precio del producto en
          la tienda. El arancel es lo que cobra la aduana: dejalo en 0 si tus
          envíos no pagan aduana. El redondeo deja los precios en cifras limpias.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-body text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-caption uppercase text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Categoría</th>
                  <th className="px-4 py-2.5">Comisión (%)</th>
                  <th className="px-4 py-2.5">Arancel (%)</th>
                  <th className="px-4 py-2.5">Redondeo (C$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {categorias.map((cat) => {
                  const row = draft[cat.id] || {
                    comision_pct: '',
                    arancel_pct: '',
                    redondeo_cor: '',
                  };
                  return (
                    <tr key={cat.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-900">{cat.nombre}</td>
                      <td className="px-4 py-2">
                        <Input
                          value={row.comision_pct}
                          onChange={(e) =>
                            handleChange(cat.id, 'comision_pct', e.target.value)
                          }
                          placeholder="35"
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={row.arancel_pct}
                          onChange={(e) =>
                            handleChange(cat.id, 'arancel_pct', e.target.value)
                          }
                          placeholder="0"
                          className="w-24 text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={row.redondeo_cor}
                          onChange={(e) =>
                            handleChange(cat.id, 'redondeo_cor', e.target.value)
                          }
                          placeholder="50"
                          className="w-28 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={guardando}>
              <Save className="w-4 h-4 mr-1.5" />
              <span>{guardando ? 'Guardando...' : 'Guardar Categorías'}</span>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
