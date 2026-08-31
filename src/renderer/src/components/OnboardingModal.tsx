import React, { useState, useEffect } from 'react';
import { Sparkles, Check, ChevronRight, ChevronLeft, Plus, Trash2 } from 'lucide-react';
import type { Categoria, CuentaBancariaJSON } from '../../../shared/types';
import { useToast } from '../context/ToastContext';
import { Field, Input, Select, Button } from './ui';
import { cn } from '../lib/cn';

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-onboarding-modal"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
    >
      <div className="bg-white w-full max-w-xl rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Encabezado */}
        <div className="p-6 bg-navy-900 text-white">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-slate-300" />
              <span className="text-caption font-bold uppercase tracking-wider text-slate-300">
                Asistente de Bienvenida
              </span>
            </div>
            {/* Indicador de pasos */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-caption font-bold transition-colors',
                    step === s
                      ? 'bg-white text-navy-900'
                      : step > s
                      ? 'bg-navy-800 text-slate-300'
                      : 'bg-navy-950 text-slate-500'
                  )}
                >
                  {step > s ? <Check className="w-3 h-3" /> : s}
                </div>
              ))}
            </div>
          </div>
          <h2 id="titulo-onboarding-modal" className="text-display text-white">
            {step === 1 && '¿Cuáles son tus cuentas bancarias?'}
            {step === 2 && '¿Cuánto te cobra tu courier en USA?'}
            {step === 3 && '¿Cuánto estimás de aranceles y aduana?'}
            {step === 4 && '¿Qué porcentaje de ganancia deseás?'}
            {step === 5 && 'Saldo actual y copias de seguridad'}
          </h2>
          <p className="text-label text-slate-300 mt-1">
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
                <div key={i} className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <Field label="Banco">
                      <Input
                        value={c.banco}
                        onChange={(e) => handleUpdateCuenta(i, 'banco', e.target.value)}
                        placeholder="Ej: BAC Credomatic"
                      />
                    </Field>
                    <Field label="Moneda">
                      <Select
                        value={c.moneda}
                        onChange={(e) => handleUpdateCuenta(i, 'moneda', e.target.value as 'COR' | 'USD')}
                      >
                        <option value="COR">C$ Córdobas</option>
                        <option value="USD">$ Dólares</option>
                      </Select>
                    </Field>
                    <div className="flex items-end justify-end">
                      {cuentas.length > 1 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveCuenta(i)}
                          className="text-danger-500 hover:text-danger-700"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          <span>Eliminar</span>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Field label="Número de cuenta">
                      <Input
                        value={c.numero}
                        onChange={(e) => handleUpdateCuenta(i, 'numero', e.target.value)}
                        placeholder="Ej: 360-123456-7"
                        className="font-mono"
                      />
                    </Field>
                    <Field label="Titular">
                      <Input
                        value={c.titular}
                        onChange={(e) => handleUpdateCuenta(i, 'titular', e.target.value)}
                        placeholder="Nombre del titular"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddCuenta}
                className="w-full justify-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                <span>Agregar otra cuenta bancaria</span>
              </Button>
            </div>
          )}

          {/* PASO 2: Courier y Flete */}
          {step === 2 && (
            <div className="space-y-4">
              <Field
                label="Tarifa de flete aéreo por libra (USD)"
                hint="Por defecto: $6.50 por libra."
              >
                <Input
                  type="number"
                  step="0.25"
                  value={tarifaFleteUsd}
                  onChange={(e) => setTarifaFleteUsd(e.target.value)}
                />
              </Field>

              <Field
                label="Flete mínimo por paquete (USD)"
                hint="Por defecto: $15.00 para paquetes pequeños. Dejalo en 0 si no aplica."
              >
                <Input
                  type="number"
                  step="1.00"
                  value={fleteMinimoUsd}
                  onChange={(e) => setFleteMinimoUsd(e.target.value)}
                />
              </Field>

              <Field
                label="Casillero / Handling por envío (USD)"
                hint="Costo fijo del casillero (ej: $10.00). Se prorratea por peso entre los ítems."
              >
                <Input
                  type="number"
                  step="1.00"
                  value={otrosCostosFijosUsd}
                  onChange={(e) => setOtrosCostosFijosUsd(e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* PASO 3: Aduana y Aranceles */}
          {step === 3 && (
            <div className="space-y-4">
              <Field
                label="Porcentaje estimado de Aduana (DAI + IVA)"
                hint="Aplica sobre el valor excedente de $50 USD por envío. Típico: 30% a 35%. Dejalo en 0 si no pagás aduana."
              >
                <Input
                  type="number"
                  step="0.5"
                  value={arancelDefault}
                  onChange={(e) => setArancelDefault(e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* PASO 4: Ganancia por Categoría */}
          {step === 4 && (
            <div className="space-y-3">
              {categorias.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <span className="text-body font-medium text-slate-800">{cat.nombre}</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="1"
                      value={comisiones[cat.id] ?? '30'}
                      onChange={(e) =>
                        setComisiones((prev) => ({ ...prev, [cat.id]: e.target.value }))
                      }
                      className="w-20 text-right"
                    />
                    <span className="text-label text-slate-500 font-medium">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* PASO 5: Saldo Inicial y Respaldo (A2) */}
          {step === 5 && (
            <div className="space-y-4">
              <Field
                label="¿Cuánto tenés hoy en tus cuentas, contando todo? (C$)"
                hint="Punto de partida para el control de efectivo y capital libre."
              >
                <Input
                  type="number"
                  step="100"
                  value={saldoInicialCor}
                  onChange={(e) => setSaldoInicialCor(e.target.value)}
                />
              </Field>

              <Field
                label="Carpeta de respaldo automático"
                hint="Al cerrar la app se guardará una copia automática rotando las últimas 30."
              >
                <Input
                  type="text"
                  value={rutaBackup}
                  onChange={(e) => setRutaBackup(e.target.value)}
                  placeholder="Dejar vacío para usar carpeta segura del sistema"
                />
              </Field>
            </div>
          )}
        </div>

        {/* Botones de Navegación del Modal */}
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={handlePrev}
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              <span>Atrás</span>
            </Button>
          ) : (
            <div />
          )}

          {step < 5 ? (
            <Button
              type="button"
              variant="primary"
              onClick={handleNext}
            >
              <span>Continuar</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={handleFinish}
              disabled={guardando}
            >
              <Check className="w-4 h-4 mr-1.5" />
              <span>{guardando ? 'Guardando...' : 'Comenzar a usar'}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
