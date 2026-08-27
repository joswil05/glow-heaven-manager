import React, { useState, useEffect } from 'react';
import { Sparkles, Check, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Categoria, CuentaBancariaJSON } from '../../../shared/types';
import { useToast } from '../context/ToastContext';

interface OnboardingModalProps {
  isOpen: boolean;
  onFinish: () => void;
  categorias: Categoria[];
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onFinish,
  categorias,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);

  // 1. Cuentas bancarias
  const [cuentas, setCuentas] = useState<CuentaBancariaJSON[]>([
    { banco: 'BAC Credomatic', numero: '', titular: 'Rossana Espinoza', moneda: 'COR' },
    { banco: 'Banpro', numero: '', titular: 'Rossana Espinoza', moneda: 'USD' },
  ]);

  // 2. Courier
  const [tarifaFleteUsd, setTarifaFleteUsd] = useState('6.50');
  const [fleteMinimoUsd, setFleteMinimoUsd] = useState('15.00');
  const [otrosCostosFijosUsd, setOtrosCostosFijosUsd] = useState('10.00');

  // 3. Aduana
  const [arancelDefault, setArancelDefault] = useState('32.5');

  // 4. Márgenes
  const [comisiones, setComisiones] = useState<Record<number, string>>({});

  // 5. Saldo inicial y respaldo (A2)
  const [saldoInicialCor, setSaldoInicialCor] = useState('0');
  const [rutaBackup, setRutaBackup] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (categorias && categorias.length > 0) {
      const initialCom: Record<number, string> = {};
      for (const c of categorias) {
        initialCom[c.id] = (c.comision_defecto_bp / 100).toString();
      }
      setComisiones(initialCom);
    }
  }, [categorias]);

  if (!isOpen) return null;

  const handleNext = () => setStep((s) => s + 1);
  const handlePrev = () => setStep((s) => s - 1);

  const handleAddCuenta = () => {
    setCuentas([
      ...cuentas,
      { banco: 'BAC Credomatic', numero: '', titular: 'Rossana Espinoza', moneda: 'COR' },
    ]);
  };

  const handleUpdateCuenta = (index: number, field: keyof CuentaBancariaJSON, val: string) => {
    const next = [...cuentas];
    next[index] = { ...next[index], [field]: val };
    setCuentas(next);
  };

  const handleRemoveCuenta = (index: number) => {
    setCuentas((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    try {
      setGuardando(true);

      const cuentasFiltradas = cuentas.filter((c) => c.numero.trim().length > 0);

      const comisionesArray = Object.entries(comisiones).map(([catId, val]) => ({
        categoria_id: parseInt(catId, 10),
        porcentaje: parseFloat(val) || 30,
      }));

      await window.api.parametros.guardarIniciales({
        cuentas_bancarias: cuentasFiltradas,
        tarifa_flete_usd: parseFloat(tarifaFleteUsd) || 6.5,
        flete_minimo_usd: parseFloat(fleteMinimoUsd) || 0,
        otros_costos_fijos_usd: parseFloat(otrosCostosFijosUsd) || 10.0,
        arancel_default_porcentaje: parseFloat(arancelDefault) || 32.5,
        comisiones_categoria: comisionesArray,
        saldo_inicial_bancos_cor: parseFloat(saldoInicialCor) || 0,
        ruta_backup: rutaBackup.trim() || undefined,
      });

      showToast({
        message: '¡Configuración inicial lista! Bienvenido a Glow Heaven Manager.',
        type: 'success',
      });
      onFinish();
    } catch {
      showToast({ message: 'Error al guardar la configuración.', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="p-6 bg-gradient-to-r from-glow-600 to-pink-500 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              <span className="text-xs font-bold uppercase tracking-wider text-pink-100">
                Asistente de Bienvenida
              </span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-white/20 rounded-full">
              Paso {step} de 5
            </span>
          </div>
          <h2 className="text-xl font-bold">
            {step === 1 && '¿Cuáles son tus cuentas bancarias?'}
            {step === 2 && '¿Cuánto te cobra tu courier en USA?'}
            {step === 3 && '¿Cuánto estimás de aranceles y aduana?'}
            {step === 4 && '¿Qué porcentaje de ganancia deseás?'}
            {step === 5 && 'Saldo actual y copias de seguridad'}
          </h2>
          <p className="text-xs text-pink-100 mt-1">
            {step === 1 && 'Estas cuentas se pegarán automáticamente al armar cotizaciones para WhatsApp.'}
            {step === 2 && 'Servirá para calcular el flete aéreo exacto por peso de cada paquete.'}
            {step === 3 && 'Se aplica sobre el valor que supere la exoneración de USD 50.'}
            {step === 4 && 'Margen por categoría para calcular tus precios en córdobas.'}
            {step === 5 && 'Punto de partida de tu dinero y ubicación de respaldos automáticos.'}
          </p>
        </div>

        {/* Contenido según el paso */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* PASO 1: Cuentas Bancarias */}
          {step === 1 && (
            <div className="space-y-3">
              {cuentas.map((c, i) => (
                <div key={i} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={c.banco}
                      onChange={(e) => handleUpdateCuenta(i, 'banco', e.target.value)}
                      placeholder="Banco (ej: BAC, Banpro)"
                      className="text-xs font-bold text-slate-800 bg-transparent border-b border-slate-300 focus:outline-none focus:border-glow-500 pb-0.5"
                    />
                    <select
                      value={c.moneda}
                      onChange={(e) => handleUpdateCuenta(i, 'moneda', e.target.value as 'COR' | 'USD')}
                      className="text-xs font-semibold bg-white px-2 py-1 rounded-lg border border-slate-200"
                    >
                      <option value="COR">C$ Córdobas</option>
                      <option value="USD">$ Dólares</option>
                    </select>
                    {cuentas.length > 1 && (
                      <button
                        onClick={() => handleRemoveCuenta(i)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-semibold"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={c.numero}
                    onChange={(e) => handleUpdateCuenta(i, 'numero', e.target.value)}
                    placeholder="Número de cuenta (ej: 360-123456-7)"
                    className="w-full bg-white px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                  <input
                    type="text"
                    value={c.titular}
                    onChange={(e) => handleUpdateCuenta(i, 'titular', e.target.value)}
                    placeholder="Nombre del titular"
                    className="w-full bg-white px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddCuenta}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                + Agregar otra cuenta bancaria
              </button>
            </div>
          )}

          {/* PASO 2: Courier y Flete */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tarifa de flete aéreo por libra (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">$</span>
                  <input
                    type="number"
                    step="0.25"
                    value={tarifaFleteUsd}
                    onChange={(e) => setTarifaFleteUsd(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Por defecto: $6.50 por libra.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Flete mínimo por paquete (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">$</span>
                  <input
                    type="number"
                    step="1.00"
                    value={fleteMinimoUsd}
                    onChange={(e) => setFleteMinimoUsd(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Por defecto: $15.00 para paquetes pequeños.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ¿Cuánto te cobra el casillero / handling por envío? (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">$</span>
                  <input
                    type="number"
                    step="1.00"
                    value={otrosCostosFijosUsd}
                    onChange={(e) => setOtrosCostosFijosUsd(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Costo fijo del casillero (ej: $10.00). Se prorratea por peso entre los ítems.</p>
              </div>
            </div>
          )}

          {/* PASO 3: Aduana y Aranceles */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Porcentaje estimado de Aduana (DAI + IVA)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.5"
                    value={arancelDefault}
                    onChange={(e) => setArancelDefault(e.target.value)}
                    className="w-full pr-8 pl-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold">%</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Aplica sobre el valor excedente de $50 USD por envío. Típico: 30% a 35%.
                </p>
              </div>
            </div>
          )}

          {/* PASO 4: Ganancia por Categoría */}
          {step === 4 && (
            <div className="space-y-3">
              {categorias.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-800">{cat.nombre}</span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="1"
                      value={comisiones[cat.id] ?? '30'}
                      onChange={(e) =>
                        setComisiones((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                      className="w-16 text-right px-2 py-1 text-xs font-bold text-slate-800 bg-white rounded-lg border border-slate-200"
                    />
                    <span className="text-xs text-slate-500 font-semibold">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PASO 5: Saldo Inicial y Respaldo (A2) */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ¿Cuánto tenés hoy en tus cuentas, contando todo? (C$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-semibold">C$</span>
                  <input
                    type="number"
                    step="100"
                    value={saldoInicialCor}
                    onChange={(e) => setSaldoInicialCor(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm font-semibold text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Punto de partida para el control de efectivo y capital libre.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Carpeta de respaldo automático
                </label>
                <input
                  type="text"
                  value={rutaBackup}
                  onChange={(e) => setRutaBackup(e.target.value)}
                  placeholder="Dejar vacío para usar carpeta segura de OneDrive"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-800 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Al cerrar la app se guardará una copia automática rotando las últimas 30.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Botones de Navegación del Modal */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={handlePrev}
              className="flex items-center gap-1 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Atrás</span>
            </button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-5 py-2.5 bg-glow-600 hover:bg-glow-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              <span>Continuar</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={guardando}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-md disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Comenzar a usar'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
