/**
 * HIS-3: las filas del historial dicen el nombre de la clienta, nunca
 * "Cliente", y un pedido sin precio dice "Por cotizar", no "$0.00".
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import { reiniciarFirestoreFalso } from './firestore-fake';
import { getFirestoreDb } from '../src/main/firebase/client';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { textoTotalDeVenta } from '../src/core/abonos';
import { hoyISO } from '../src/core/fechas';

const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

async function ventaACredito(cliente_id?: number): Promise<number> {
  return Ventas.crear(
    {
      fecha: hoyISO(),
      tipo: 'INVENTARIO',
      cliente_id,
      lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 5000 }],
    },
    g()
  );
}

describe('textoTotalDeVenta', () => {
  it('un pedido sin precio dice "Por cotizar"', () => {
    expect(textoTotalDeVenta({ tipo: 'ENCARGO', total_usd_cents: 0 })).toBe('Por cotizar');
  });

  it('con precio, o si no es un pedido, el monto', () => {
    expect(textoTotalDeVenta({ tipo: 'ENCARGO', total_usd_cents: 1250 })).toBe('$12.50');
    expect(textoTotalDeVenta({ tipo: 'INVENTARIO', total_usd_cents: 0 })).toBe('$0.00');
  });
});

describe('el nombre de cada abono en el historial', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    Parametros.invalidarCache();
    Panel.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
  });

  it('de una venta de mostrador dice "Mostrador"', async () => {
    const venta = await ventaACredito();
    await Pagos.registrar({ venta_id: venta, fecha: hoyISO(), monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    const [abono] = await Pagos.recientes(5);
    expect(abono.cliente_nombre).toBe('Mostrador');
  });

  it('sin la clienta en el abono, toma la de su venta', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana Prueba' }, g());
    const venta = await ventaACredito(ana);
    await Pagos.registrar({ venta_id: venta, fecha: hoyISO(), monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    const [guardado] = await Pagos.recientes(5);
    expect(guardado.cliente_nombre).toBe('Ana Prueba');

    // Un abono viejo, de antes de que se guardara la clienta en el abono.
    await setDoc(doc(getFirestoreDb(), 'pagos', String(guardado.id)), { cliente_id: null }, { merge: true });
    const [viejo] = await Pagos.recientes(5);
    expect(viejo.cliente_nombre).toBe('Ana Prueba');
  });
});
