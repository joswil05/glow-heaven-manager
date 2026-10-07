import { useEffect, useRef, useState } from 'react';
import type { VentaCompleta } from '@shared/types';
import { piezasDe, piezasVivas, sinPrecio } from '@core/encargos';
import { formatearMoneda } from '@core/moneda';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { aceptarEncargo } from '../../../src/main/firebase/services/encargos.service';
import { BottomSheet } from './BottomSheet';
import { useSnackbar } from './Snackbar';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';

export function puedeAceptarEncargo(venta: VentaCompleta): boolean {
  return venta.estado === 'COTIZADA' && piezasVivas(piezasDe(venta.lineas)) > 0 && !venta.lineas.some(sinPrecio);
}

export function AceptarEncargoSheet({ venta, onCerrar, onAceptado, onRegistrarAbono }: {
  venta: VentaCompleta | null;
  onCerrar: () => void;
  onAceptado: () => void;
  onRegistrarAbono: (venta: VentaCompleta) => void;
}) {
  const ultima = useRef(venta);
  if (venta) ultima.current = venta;
  const [sinPago, setSinPago] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const ocupado = useRef(false);
  const { mostrar, mostrarDeshacer } = useSnackbar();
  const abierta = venta !== null;

  useEffect(() => {
    if (!abierta) return;
    setSinPago(false);
    setError('');
  }, [abierta, venta?.id]);

  async function confirmar() {
    if (!venta || ocupado.current) return;
    if (!sinPago) {
      haptics.error();
      setError('Elegí si pagó algo.');
      return;
    }
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setError('');
    try {
      const grupo = nuevoGrupoEvento();
      await aceptarEncargo(venta.id, undefined, grupo);
      mostrarDeshacer('Encargo aceptado', grupo, onAceptado);
      onAceptado();
      onCerrar();
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : 'No se pudo aceptar el encargo.');
      // Si falló un paso posterior a escribir, mostrar el estado que sí quedó.
      try {
        const actual = await VentasRepoFirestore.getById(venta.id);
        if (actual?.estado === 'PENDIENTE') {
          mostrar('El encargo quedó aceptado. Revisá su detalle.', 'info');
          onAceptado();
          onCerrar();
        }
      } catch { /* Conservar el error y los datos hasta poder revisar. */ }
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  const v = venta ?? ultima.current;
  if (!v) return null;
  return <BottomSheet abierto={abierta} titulo={`${v.cliente_nombre || 'La clienta'} aceptó`}
    subtitulo={v.codigo} onCerrar={onCerrar} hayCambios={sinPago} ocupado={guardando}
    footer={<button type="button" onClick={() => void confirmar()} disabled={guardando || !sinPago}
      className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
      {guardando ? 'Guardando…' : 'Aceptó'}
    </button>}>
    <div className="flex flex-col gap-4 py-2">
      <div className="rounded-xl border border-borde bg-superficie-2 p-4">
        <p className="text-sm text-texto-2">Total de la cotización</p>
        <p className="mt-1 text-xl font-bold tabular-nums">{formatearMoneda(v.total_usd_cents, 'USD')}</p>
        <p className="mt-2 text-sm text-texto-2">El anticipo es de {formatearMoneda(v.anticipo_esperado_usd_cents, 'USD')}. Podés confirmar que aceptó aunque todavía no haya pagado.</p>
      </div>
      <p className="text-base font-bold">¿Pagó algo?</p>
      <button type="button" aria-pressed={sinPago} disabled={guardando}
        onClick={() => { haptics.selection(); setSinPago(true); setError(''); }}
        className={`min-h-12 rounded-xl border px-4 py-3 text-left text-base font-semibold ${sinPago
          ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-borde bg-superficie-2 text-texto'}`}>
        Todavía no
      </button>
      <button type="button" disabled={guardando} onClick={() => {
        if (!venta || ocupado.current) return;
        haptics.selection();
        onRegistrarAbono(venta);
      }} className="min-h-12 rounded-xl border border-borde bg-superficie-2 px-4 py-3 text-left text-base font-semibold">
        Registrar abono
      </button>
      {error && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{error}</p>}
    </div>
  </BottomSheet>;
}
