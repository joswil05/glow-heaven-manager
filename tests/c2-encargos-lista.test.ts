/** Lista móvil en curso: sin recorte de fecha, sin N+1 y sin mutaciones. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../src/main/firebase/client';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { cargarEncargosEnCurso } from '../mobile/src/lib/encargos-movil';
import { haceDias, hoyISO } from '../src/core/fechas';
import { etapaEncargo } from '../src/core/encargos';

const grupo = () => randomUUID();
const encargo = (fecha: string, cliente_id?: number, precio = 3000) => Ventas.crear({
  fecha, tipo: 'ENCARGO', cliente_id,
  lineas: [{ descripcion: 'Bolso Coach', cantidad: 2, precio_unitario_usd_cents: precio }],
}, grupo());

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T16:00:00Z'));
  await Ventas.crear({ fecha: hoyISO(), tipo: 'INVENTARIO',
    lineas: [{ descripcion: 'V-0001', cantidad: 1, precio_unitario_usd_cents: 1000 }],
  }, grupo());
});

afterEach(() => vi.useRealTimers());

describe('C2 · lista de encargos móvil', () => {
  it('incluye pendientes viejos y excluye ventas normales, entregados, anulados e inactivos', async () => {
    const vieja = await encargo(haceDias(200));
    const aceptada = await encargo(haceDias(150));
    await Ventas.aceptar(aceptada, grupo());
    const entregada = await encargo(hoyISO());
    await Ventas.cambiarEstado(entregada, 'ENTREGADA', grupo());
    const anulada = await encargo(hoyISO());
    await Ventas.cambiarEstado(anulada, 'CANCELADA', grupo());
    const inactiva = await encargo(hoyISO());
    await setDoc(doc(getFirestoreDb(), 'ventas', String(inactiva)), { activo: false }, { merge: true });

    const lista = await cargarEncargosEnCurso();

    expect(lista.map(v => v.id)).toEqual([aceptada, vieja]);
    expect(lista.map(etapaEncargo)).toEqual(['POR_COMPRAR', 'POR_MANDAR']);
    expect(lista.every(v => v.tipo === 'ENCARGO' && v.activo)).toBe(true);
  });

  it('ordena por fecha e id descendentes y muestra clienta y pedido sin cargar cada detalle', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana Prueba' }, grupo());
    const vieja = await encargo(haceDias(100), ana);
    const primeraDeHoy = await encargo(hoyISO(), ana);
    await Ventas.aceptar(primeraDeHoy, grupo());
    const ultimaDeHoy = await encargo(hoyISO(), ana, 0);
    reiniciarContadores();

    const lista = await cargarEncargosEnCurso();

    expect(lista.map(v => v.id)).toEqual([ultimaDeHoy, primeraDeHoy, vieja]);
    expect(lista.map(v => v.cliente_nombre)).toEqual(['Ana Prueba', 'Ana Prueba', 'Ana Prueba']);
    expect(lista.map(v => v.que_pidio)).toEqual(['2 Bolso Coach', '2 Bolso Coach', '2 Bolso Coach']);
    expect(etapaEncargo(lista[0])).toBe('POR_BUSCAR');
    // Tres encargos + Ana una vez por cada consulta de estado. Ningún detalle
    // ni directorio completo: la cuenta no sube con las filas de la misma clienta.
    expect(contadores()).toMatchObject({ lecturas: 5, consultas: 2, escrituras: 0, borrados: 0 });
  });

  it('no lee encargos cerrados ni clientas ajenas a la lista', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, grupo());
    for (let i = 0; i < 8; i++) {
      const cliente = await Clientes.guardar({ nombre: `Histórica ${i}` }, grupo());
      const cerrado = await encargo(haceDias(400), cliente);
      await Ventas.cambiarEstado(cerrado, 'ENTREGADA', grupo());
    }
    const vivo = await encargo(haceDias(200), ana);
    reiniciarContadores();

    expect((await cargarEncargosEnCurso()).map(v => v.id)).toEqual([vivo]);
    // El falso cuenta documentos: una venta + Ana. La consulta PENDIENTE
    // vacía queda visible en consultas, aunque Google cobra su lectura mínima.
    expect(contadores()).toMatchObject({ lecturas: 2, consultas: 2, escrituras: 0, borrados: 0 });
  });
});
