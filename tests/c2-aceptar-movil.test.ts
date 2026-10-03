/** El adaptador móvil conserva aceptación, moneda y Deshacer del servicio. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { contadores, reiniciarContadores, reiniciarFirestoreFalso, volcar } from './firestore-fake';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import type { RegistrarPagoInput } from '../src/main/firebase/repositories/pagos.repo';
import { aceptarEncargo } from '../src/main/firebase/services/encargos.service';
import { registrarAbonoMovil } from '../mobile/src/lib/registrar-abono-movil';
import { hoyISO } from '../src/core/fechas';

const grupo = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  // Deshacer distingue escrituras posteriores por tiempo: el falso necesita
  // separar los eventos igual que una petición real (encargos-fases.test.ts).
  const registrar = Eventos.registrarVarios.bind(Eventos);
  vi.spyOn(Eventos, 'registrarVarios').mockImplementation(async (eventos) => {
    await registrar(eventos);
    await new Promise((resolver) => setTimeout(resolver, 3));
  });
});

afterEach(() => vi.restoreAllMocks());

const encargo = () => Ventas.crear({
  fecha: HOY,
  tipo: 'ENCARGO',
  anticipo_bp: 5000,
  lineas: [{ descripcion: 'Bolso C2 aceptar', cantidad: 1, precio_unitario_usd_cents: 10000 }],
}, grupo());

const pago = (venta_id: number, monto_cents = 100): RegistrarPagoInput => ({
  venta_id, fecha: HOY, monto_cents, moneda: 'USD', metodo: 'EFECTIVO',
});

const leer = async (id: number) => {
  const venta = await Ventas.getById(id);
  if (!venta) throw new Error('La fixture del encargo no existe.');
  return venta;
};

describe('C2 · registrar abono móvil al aceptar', () => {
  it('un dólar menor al anticipo acepta y Deshacer revierte aceptación y pago juntos', async () => {
    const id = await encargo();
    const accion = grupo();
    const resultado = await registrarAbonoMovil(pago(id), accion, true);
    let venta = await leer(id);
    expect(resultado.saldo_usd_cents).toBe(9900);
    expect([venta.estado, venta.pagado_usd_cents, venta.saldo_usd_cents]).toEqual(['PENDIENTE', 100, 9900]);
    expect(venta.anticipo_esperado_usd_cents).toBe(5000);
    expect(venta.pagos.filter((p) => p.activo)).toHaveLength(1);

    expect((await Eventos.deshacerGrupo(accion)).revertido).toBe(true);
    venta = await leer(id);
    expect([venta.estado, venta.pagado_usd_cents, venta.saldo_usd_cents]).toEqual(['COTIZADA', 0, 10000]);
    expect(venta.pagos.filter((p) => p.activo)).toHaveLength(0);
  });

  it('sin la opción aceptar registra el abono pequeño y conserva COTIZADA', async () => {
    const id = await encargo();
    const resultado = await registrarAbonoMovil(pago(id), grupo());
    const venta = await leer(id);
    expect(resultado.saldo_usd_cents).toBe(9900);
    expect([venta.estado, venta.pagado_usd_cents]).toEqual(['COTIZADA', 100]);
    expect(venta.pagos.filter((p) => p.activo)).toHaveLength(1);
  });

  it('acepta un abono en córdobas con la tasa congelada del encargo', async () => {
    await Parametros.actualizar({ tasa_cambio_cents: 3662 }, grupo());
    const id = await encargo();
    await Parametros.actualizar({ tasa_cambio_cents: 4000 }, grupo());
    // C$36.62 equivale a $1 con la tasa del encargo; la tasa nueva daría $0.92.
    await registrarAbonoMovil({ ...pago(id, 3662), moneda: 'COR' }, grupo(), true);
    const venta = await leer(id);
    const abono = venta.pagos.find((p) => p.activo)!;
    expect([venta.estado, venta.pagado_usd_cents, venta.saldo_usd_cents]).toEqual(['PENDIENTE', 100, 9900]);
    expect([abono.moneda, abono.monto_cor_cents, abono.monto_usd_cents, abono.tasa_cambio_cents])
      .toEqual(['COR', 3662, 100, 3662]);
  });

  it.each([0, -100, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'el adaptador rechaza monto inválido %s antes de aceptar o escribir',
    async (monto) => {
      const id = await encargo();
      const antes = await leer(id);
      const eventosAntes = volcar('eventos');
      reiniciarContadores();
      await expect(registrarAbonoMovil(pago(id, monto), grupo(), true)).rejects.toThrow();
      expect(contadores().escrituras).toBe(0);
      expect(contadores().borrados).toBe(0);
      expect(await leer(id)).toEqual(antes);
      expect(volcar('pagos')).toHaveLength(0);
      expect(volcar('eventos')).toEqual(eventosAntes);
    },
  );

  it('si aceptar falla después del pago conserva el error y no repite el importe', async () => {
    const id = await encargo();
    // Fallo puntual de la segunda operación: el pago previo sigue siendo real.
    // Si el adaptador reintenta todo, la segunda aceptación funcionaría y
    // habría dos abonos en la base. El rechazo y el saldo detectan ese error.
    vi.spyOn(Ventas, 'aceptar').mockRejectedValueOnce(new Error('Fallo de aceptación C2'));
    await expect(registrarAbonoMovil(pago(id), grupo(), true)).rejects.toThrow('Fallo de aceptación C2');
    const venta = await leer(id);
    expect([venta.estado, venta.pagado_usd_cents, venta.saldo_usd_cents]).toEqual(['COTIZADA', 100, 9900]);
    expect(venta.pagos.filter((p) => p.activo)).toHaveLength(1);
  });

  it('el servicio permite aceptar sin abono y Deshacer conserva el anticipo pedido', async () => {
    const id = await encargo();
    const accion = grupo();
    await aceptarEncargo(id, undefined, accion);
    let venta = await leer(id);
    expect([venta.estado, venta.pagado_usd_cents, venta.anticipo_esperado_usd_cents])
      .toEqual(['PENDIENTE', 0, 5000]);
    expect(venta.pagos).toHaveLength(0);
    expect((await Eventos.deshacerGrupo(accion)).revertido).toBe(true);
    venta = await leer(id);
    expect([venta.estado, venta.pagado_usd_cents, venta.anticipo_esperado_usd_cents])
      .toEqual(['COTIZADA', 0, 5000]);
  });
});
