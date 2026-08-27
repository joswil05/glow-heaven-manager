import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plane,
  ShieldAlert,
  Percent,
  Save,
  Trash2,
} from 'lucide-react';
import type { ParametrosSistema, Categoria, CuentaBancariaJSON } from '../../../shared/types';
import { useToast } from '../context/ToastContext';

interface ConfigViewProps {
  parametros: ParametrosSistema | null;
  categorias: Categoria[];
  onRefresh: () => void;
}

export const ConfigView: React.FC<ConfigViewProps> = ({
  parametros,
  onRefresh,
}) => {
  const { showToast, showUndoToast } = useToast();

  // Estados locales en formato humano
  const [tasaCambio, setTasaCambio] = useState('36.62');
  const [tarifaFlete, setTarifaFlete] = useState('6.50');
  const [fleteMinimo, setFleteMinimo] = useState('15.00');
  const [otrosCostosFijos, setOtrosCostosFijos] = useState('10.00');
  const [umbralArancel, setUmbralArancel] = useState('50.00');
  const [arancelDefault, setArancelDefault] = useState('32.5');
  const [comisionMinima, setComisionMinima] = useState('300.00');
  const [anticipoDefault, setAnticipoDefault] = useState('50');
  const [cuentas, setCuentas] = useState<CuentaBancariaJSON[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (parametros) {
      setTasaCambio((parametros.tasa_cambio_oficial_cents / 100).toFixed(2));
      setTarifaFlete((parametros.tarifa_flete_cents_lb / 100).toFixed(2));
      setFleteMinimo((parametros.flete_minimo_usd_cents / 100).toFixed(2));
      setOtrosCostosFijos(((parametros.otros_costos_fijos_usd_cents || 1000) / 100).toFixed(2));
      setUmbralArancel((parametros.umbral_arancel_excedente_usd_cents / 100).toFixed(2));
      setArancelDefault((parametros.arancel_default_bp / 100).toFixed(1));
      setComisionMinima((parametros.comision_minima_cotizacion_cor_cents / 100).toFixed(2));
      setAnticipoDefault((parametros.anticipo_default_bp / 100).toFixed(0));
      setCuentas(parametros.cuentas_bancarias || []);
    }
  }, [parametros]);

  const handleAddCuenta = () => {
    setCuentas((prev) => [
      ...prev,
      { banco: 'BAC Credomatic', numero: '', titular: 'Rossana Espinoza', moneda: 'COR' },
    ]);
  };

  const handleUpdateCuenta = (index: number, field: keyof CuentaBancariaJSON, value: string) => {
    setCuentas((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  };

  const handleRemoveCuenta = (index: number) => {
    setCuentas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setGuardando(true);

      const tasaCents = Math.round(parseFloat(tasaCambio) * 100);
      const fleteCents = Math.round(parseFloat(tarifaFlete) * 100);
      const fleteMinCents = Math.round(parseFloat(fleteMinimo) * 100);
      const otrosCostosCents = Math.round(parseFloat(otrosCostosFijos) * 100);
      const umbralCents = Math.round(parseFloat(umbralArancel) * 100);
      const arancelBp = Math.round(parseFloat(arancelDefault) * 100);
      const comisionMinCents = Math.round(parseFloat(comisionMinima) * 100);
      const anticipoBp = Math.round(parseFloat(anticipoDefault) * 100);

      await Promise.all([
        window.api.parametros.update('tasa_cambio_oficial_cents', tasaCents.toString()),
        window.api.parametros.update('tarifa_flete_cents_lb', fleteCents.toString()),
        window.api.parametros.update('flete_minimo_usd_cents', fleteMinCents.toString()),
        window.api.parametros.update('otros_costos_fijos_usd_cents', otrosCostosCents.toString()),
        window.api.parametros.update('umbral_arancel_excedente_usd_cents', umbralCents.toString()),
        window.api.parametros.update('arancel_default_bp', arancelBp.toString()),
        window.api.parametros.update(
          'comision_minima_cotizacion_cor_cents',
          comisionMinCents.toString()
        ),
        window.api.parametros.update('anticipo_default_bp', anticipoBp.toString()),
        window.api.parametros.update('cuentas_bancarias', JSON.stringify(cuentas)),
      ]);

      showUndoToast('Parámetros de configuración actualizados correctamente', () => onRefresh());
      onRefresh();
    } catch {
      showToast({ message: 'Error al guardar la configuración', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Configuración del Sistema
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ajusta los costos, tarifas, cuentas y márgenes en lenguaje claro (A4).
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
        {/* 1. Tasa de Cambio y Courier */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Plane className="w-4 h-4 text-glow-600" />
            <span>Tasa de Cambio y Tarifas de Courier USA</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tasa Oficial (C$ / $1 USD)
              </label>
              <input
                type="number"
                step="0.01"
                value={tasaCambio}
                onChange={(e) => setTasaCambio(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Flete Courier ($ / Lb)
              </label>
              <input
                type="number"
                step="0.1"
                value={tarifaFlete}
                onChange={(e) => setTarifaFlete(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Flete Mínimo ($ USD)
              </label>
              <input
                type="number"
                step="1.0"
                value={fleteMinimo}
                onChange={(e) => setFleteMinimo(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Casillero Fijo ($ USD)
              </label>
              <input
                type="number"
                step="1.0"
                value={otrosCostosFijos}
                onChange={(e) => setOtrosCostosFijos(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>
          </div>
        </div>

        {/* 2. Aduana y Aranceles */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <ShieldAlert className="w-4 h-4 text-glow-600" />
            <span>Aduana y Aranceles de Importación</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Umbral de Exoneración ($ USD por envío)
              </label>
              <input
                type="number"
                step="1.0"
                value={umbralArancel}
                onChange={(e) => setUmbralArancel(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                El arancel aplica únicamente sobre el monto que exceda este umbral.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Arancel Estimado por Defecto (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={arancelDefault}
                onChange={(e) => setArancelDefault(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Porcentaje típico para mercadería general (ej: 32.5%).
              </p>
            </div>
          </div>
        </div>

        {/* 3. Ganancia y Anticipo */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
            <Percent className="w-4 h-4 text-glow-600" />
            <span>Comisión Mínima y Anticipos</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Comisión Mínima por Cotización (C$)
              </label>
              <input
                type="number"
                step="10.0"
                value={comisionMinima}
                onChange={(e) => setComisionMinima(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Si la suma de comisiones no alcanza este valor, se ajusta al mínimo.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Anticipo por Defecto (%)
              </label>
              <input
                type="number"
                step="5"
                value={anticipoDefault}
                onChange={(e) => setAnticipoDefault(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>
          </div>
        </div>

        {/* 4. Cuentas Bancarias Estructuradas (A3) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Building2 className="w-4 h-4 text-glow-600" />
              <span>Cuentas Bancarias para Mensajes de WhatsApp</span>
            </div>
            <button
              type="button"
              onClick={handleAddCuenta}
              className="text-xs font-bold text-glow-600 hover:text-glow-700"
            >
              + Agregar Cuenta
            </button>
          </div>

          <div className="space-y-3">
            {cuentas.map((c, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between gap-3"
              >
                <div className="grid grid-cols-4 gap-2 flex-1 text-xs">
                  <input
                    type="text"
                    value={c.banco}
                    onChange={(e) => handleUpdateCuenta(idx, 'banco', e.target.value)}
                    placeholder="Banco"
                    className="px-2 py-1 bg-white rounded-lg border border-slate-200 font-bold"
                  />
                  <input
                    type="text"
                    value={c.numero}
                    onChange={(e) => handleUpdateCuenta(idx, 'numero', e.target.value)}
                    placeholder="Número de cuenta"
                    className="px-2 py-1 bg-white rounded-lg border border-slate-200 font-mono"
                  />
                  <input
                    type="text"
                    value={c.titular}
                    onChange={(e) => handleUpdateCuenta(idx, 'titular', e.target.value)}
                    placeholder="Titular"
                    className="px-2 py-1 bg-white rounded-lg border border-slate-200"
                  />
                  <select
                    value={c.moneda}
                    onChange={(e) =>
                      handleUpdateCuenta(idx, 'moneda', e.target.value as 'COR' | 'USD')
                    }
                    className="px-2 py-1 bg-white rounded-lg border border-slate-200 font-semibold"
                  >
                    <option value="COR">C$ Córdobas</option>
                    <option value="USD">$ Dólares</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveCuenta(idx)}
                  className="text-slate-400 hover:text-rose-500 p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Botón de Guardar Cambios */}
        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={guardando}
            className="flex items-center gap-2 px-6 py-2.5 bg-glow-600 hover:bg-glow-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando...' : 'Guardar Todos los Parámetros'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
