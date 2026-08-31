import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plane,
  ShieldAlert,
  Percent,
  Save,
  Trash2,
  Plus,
} from 'lucide-react';
import type { ParametrosSistema, Categoria, CuentaBancariaJSON } from '../../../shared/types';
import { parsearACentavos } from '@core/numeros';
import { useToast } from '../context/ToastContext';
import {
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  Field,
  Input,
  Select,
  Button,
} from '../components/ui';
import { cn } from '../lib/cn';
import { CategoriasSection } from './config/CategoriasSection';

const SECCIONES = [
  { id: 'tasa_courier' as const, label: 'Tasa y courier' },
  { id: 'aduana' as const, label: 'Aduana' },
  { id: 'categorias' as const, label: 'Categorías y ganancia' },
  { id: 'cuentas' as const, label: 'Cuentas bancarias' },
];

interface ConfigViewProps {
  parametros: ParametrosSistema | null;
  categorias: Categoria[];
  onRefresh: () => void;
}

export const ConfigView: React.FC<ConfigViewProps> = ({
  parametros,
  categorias,
  onRefresh,
}) => {
  const { showToast, showUndoToast } = useToast();
  const [seccion, setSeccion] = useState<'tasa_courier' | 'aduana' | 'categorias' | 'cuentas'>('tasa_courier');

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

      const campos: { clave: string; etiqueta: string; texto: string; min: number; max: number }[] = [
        { clave: 'tasa_cambio_oficial_cents', etiqueta: 'Tasa de cambio', texto: tasaCambio, min: 1, max: 1000 },
        { clave: 'tarifa_flete_cents_lb', etiqueta: 'Tarifa de flete', texto: tarifaFlete, min: 0, max: 1000 },
        { clave: 'flete_minimo_usd_cents', etiqueta: 'Flete mínimo', texto: fleteMinimo, min: 0, max: 1000 },
        { clave: 'otros_costos_fijos_usd_cents', etiqueta: 'Casillero', texto: otrosCostosFijos, min: 0, max: 1000 },
        { clave: 'umbral_arancel_excedente_usd_cents', etiqueta: 'Exoneración de aduana', texto: umbralArancel, min: 0, max: 100000 },
        { clave: 'comision_minima_cotizacion_cor_cents', etiqueta: 'Comisión mínima', texto: comisionMinima, min: 0, max: 1000000 },
        { clave: 'arancel_default_bp', etiqueta: 'Arancel por defecto', texto: arancelDefault, min: 0, max: 100 },
        { clave: 'anticipo_default_bp', etiqueta: 'Anticipo por defecto', texto: anticipoDefault, min: 0, max: 100 },
      ];

      const valores: Record<string, string> = {};
      for (const campo of campos) {
        const n = parsearACentavos(campo.texto, { min: campo.min, max: campo.max });
        if (n === null) {
          showToast({
            message: `Revisá "${campo.etiqueta}": escribí solo números, por ejemplo 36.62`,
            type: 'error',
          });
          setGuardando(false);
          return;
        }
        valores[campo.clave] = n.toString();
      }
      valores['cuentas_bancarias'] = JSON.stringify(cuentas);

      await Promise.all([
        window.api.parametros.update('tasa_cambio_oficial_cents', valores['tasa_cambio_oficial_cents']),
        window.api.parametros.update('tarifa_flete_cents_lb', valores['tarifa_flete_cents_lb']),
        window.api.parametros.update('flete_minimo_usd_cents', valores['flete_minimo_usd_cents']),
        window.api.parametros.update('otros_costos_fijos_usd_cents', valores['otros_costos_fijos_usd_cents']),
        window.api.parametros.update('umbral_arancel_excedente_usd_cents', valores['umbral_arancel_excedente_usd_cents']),
        window.api.parametros.update('arancel_default_bp', valores['arancel_default_bp']),
        window.api.parametros.update('comision_minima_cotizacion_cor_cents', valores['comision_minima_cotizacion_cor_cents']),
        window.api.parametros.update('anticipo_default_bp', valores['anticipo_default_bp']),
        window.api.parametros.update('cuentas_bancarias', valores['cuentas_bancarias']),
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
      <div>
        <h2 className="text-display text-slate-900 tracking-tight">
          Configuración del Sistema
        </h2>
        <p className="text-label text-slate-500 mt-0.5">
          Ajustá los costos, tarifas, cuentas y márgenes en lenguaje claro.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <nav className="space-y-1">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSeccion(s.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-body transition-colors',
                seccion === s.id
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="lg:col-span-3 space-y-4">
          {seccion === 'tasa_courier' && (
            <Card>
              <CardHeader>
                <SectionHeader
                  icon={Plane}
                  title="Tasa de Cambio y Tarifas de Courier USA"
                  description="Parámetros base para conversión de divisas y flete internacional."
                />
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Tasa Oficial (C$ / $1 USD)">
                      <Input
                        value={tasaCambio}
                        onChange={(e) => setTasaCambio(e.target.value)}
                        placeholder="36.62"
                      />
                    </Field>

                    <Field label="Flete Courier ($ / Lb)">
                      <Input
                        value={tarifaFlete}
                        onChange={(e) => setTarifaFlete(e.target.value)}
                        placeholder="6.50"
                      />
                    </Field>

                    <Field
                      label="Flete mínimo por envío (USD)"
                      hint="Dejalo en 0 si tu courier solo cobra por libra. Un mínimo alto encarece mucho los productos livianos."
                    >
                      <Input
                        value={fleteMinimo}
                        onChange={(e) => setFleteMinimo(e.target.value)}
                        placeholder="0.00"
                      />
                    </Field>

                    <Field label="Casillero / Handling Fijo ($ USD)">
                      <Input
                        value={otrosCostosFijos}
                        onChange={(e) => setOtrosCostosFijos(e.target.value)}
                        placeholder="10.00"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" variant="primary" disabled={guardando}>
                      <Save className="w-4 h-4 mr-1.5" />
                      <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {seccion === 'aduana' && (
            <Card>
              <CardHeader>
                <SectionHeader
                  icon={ShieldAlert}
                  title="Aduana y Aranceles de Importación"
                  description="Reglas fiscales y porcentaje arancelario general."
                />
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field
                      label="Umbral de Exoneración ($ USD por envío)"
                      hint="El arancel aplica únicamente sobre el monto que exceda este umbral."
                    >
                      <Input
                        value={umbralArancel}
                        onChange={(e) => setUmbralArancel(e.target.value)}
                        placeholder="50.00"
                      />
                    </Field>

                    <Field
                      label="Arancel Estimado por Defecto (%)"
                      hint="Porcentaje típico para mercadería general (ej: 32.5%). Dejalo en 0 si no pagas aduana."
                    >
                      <Input
                        value={arancelDefault}
                        onChange={(e) => setArancelDefault(e.target.value)}
                        placeholder="32.5"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" variant="primary" disabled={guardando}>
                      <Save className="w-4 h-4 mr-1.5" />
                      <span>{guardando ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {seccion === 'categorias' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <SectionHeader
                    icon={Percent}
                    title="Parámetros Globales de Ganancia y Anticipo"
                  />
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSave} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field
                        label="Comisión Mínima por Cotización (C$)"
                        hint="Si la suma de comisiones no alcanza este valor, se ajusta al mínimo."
                      >
                        <Input
                          value={comisionMinima}
                          onChange={(e) => setComisionMinima(e.target.value)}
                          placeholder="300.00"
                        />
                      </Field>

                      <Field
                        label="Anticipo por Defecto (%)"
                        hint="Porcentaje de anticipo sugerido en nuevas cotizaciones."
                      >
                        <Input
                          value={anticipoDefault}
                          onChange={(e) => setAnticipoDefault(e.target.value)}
                          placeholder="50"
                        />
                      </Field>
                    </div>

                    <div className="flex justify-end pt-2">
                      <Button type="submit" variant="primary" disabled={guardando}>
                        <Save className="w-4 h-4 mr-1.5" />
                        <span>{guardando ? 'Guardando...' : 'Guardar Parámetros'}</span>
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <CategoriasSection categorias={categorias} onRefresh={onRefresh} />
            </div>
          )}

          {seccion === 'cuentas' && (
            <Card>
              <CardHeader>
                <SectionHeader
                  icon={Building2}
                  title="Cuentas Bancarias para Mensajes de WhatsApp"
                  description="Estas cuentas se adjuntan automáticamente al generar mensajes para clientes."
                  action={
                    <Button size="sm" variant="secondary" onClick={handleAddCuenta}>
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      <span>Agregar Cuenta</span>
                    </Button>
                  }
                />
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                  <div className="space-y-3">
                    {cuentas.map((c, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 flex-1">
                          <Input
                            value={c.banco}
                            onChange={(e) => handleUpdateCuenta(idx, 'banco', e.target.value)}
                            placeholder="Banco (ej: BAC)"
                          />
                          <Input
                            value={c.numero}
                            onChange={(e) => handleUpdateCuenta(idx, 'numero', e.target.value)}
                            placeholder="Número de cuenta"
                            className="font-mono"
                          />
                          <Input
                            value={c.titular}
                            onChange={(e) => handleUpdateCuenta(idx, 'titular', e.target.value)}
                            placeholder="Titular de cuenta"
                          />
                          <Select
                            value={c.moneda}
                            onChange={(e) =>
                              handleUpdateCuenta(idx, 'moneda', e.target.value as 'COR' | 'USD')
                            }
                          >
                            <option value="COR">C$ Córdobas</option>
                            <option value="USD">$ Dólares</option>
                          </Select>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveCuenta(idx)}
                          className="text-slate-400 hover:text-danger-500 p-2 shrink-0 self-end md:self-center"
                          title="Eliminar cuenta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    {cuentas.length === 0 && (
                      <p className="text-body text-slate-500 text-center py-4">
                        No hay cuentas bancarias registradas. Agrega al menos una para compartirla con tus clientes.
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" variant="primary" disabled={guardando}>
                      <Save className="w-4 h-4 mr-1.5" />
                      <span>{guardando ? 'Guardando...' : 'Guardar Cuentas'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
