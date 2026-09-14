/**
 * Fase 4: hasta dónde llega la atomicidad de una operación.
 *
 * `aplicarLote()` parte las escrituras en trozos de 500, que es el máximo de
 * un lote de Firestore, y confirma cada trozo por separado. Un lote es
 * atómico; DOS lotes no lo son: si el segundo falla, el primero ya quedó
 * escrito y no hay vuelta atrás.
 *
 * O sea que hay un umbral, invisible desde la interfaz, a partir del cual una
 * operación deja de ser todo-o-nada. Estas pruebas miden dónde está ese
 * umbral para las operaciones grandes de verdad del negocio —recibir un
 * paquete, recalcular todos los precios— y fallan si alguna se acerca.
 *
 * No se prueba contra el emulador a propósito: lo que se mide es cuántas
 * escrituras genera cada operación, y eso se ve mejor con el contador del
 * Firestore falso.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  reiniciarFirestoreFalso,
  reiniciarContadores,
  contadores,
} from './firestore-fake';
import { ComprasRepoFirestore } from '../src/main/firebase/repositories/compras.repo';
import { ProductosRepoFirestore } from '../src/main/firebase/repositories/productos.repo';
import { ParametrosRepoFirestore } from '../src/main/firebase/repositories/parametros.repo';

const HOY = '2026-09-14';
const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

/** El tope de un lote de Firestore. Más que esto deja de ser atómico. */
const MAXIMO_LOTE = 500;

describe('el umbral de atomicidad', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
  });

  it('recibir un paquete grande cabe en un solo lote', async () => {
    // 40 líneas es un paquete enorme para este negocio. Si una operación de
    // este tamaño pasara de 500 escrituras, recibir un paquete podría quedar
    // a medias: parte de la mercadería adentro y el paquete sin marcar.
    const lineas = Array.from({ length: 40 }, (_, i) => ({
      descripcion: `Producto ${i + 1}`,
      cantidad: 3,
      precio_linea_usd_cents: 1500,
      peso_linea_mlb: 800,
      destino: 'INVENTARIO' as const,
    }));

    const compraId = await ComprasRepoFirestore.guardar(
      { fecha: HOY, envio_total_usd_cents: 12000, lineas },
      g()
    );

    reiniciarContadores();
    await ComprasRepoFirestore.recibir(compraId, g());
    const { escrituras } = contadores();
    // eslint-disable-next-line no-console
    console.log(`  recibir 40 líneas: ${escrituras} escrituras`);

    expect(
      escrituras,
      `recibir 40 líneas cuesta ${escrituras} escrituras; el lote atómico corta en ${MAXIMO_LOTE}`
    ).toBeLessThan(MAXIMO_LOTE);
  });

  it('recalcular los precios de un inventario grande se parte en varios lotes', async () => {
    // Esta sí puede pasarse, y está bien que lo haga: recalcular precios es
    // idempotente, correrlo de nuevo termina el trabajo. Lo que la prueba fija
    // es que sepamos cuáles operaciones son de las que se pueden reintentar.
    for (let i = 0; i < 120; i++) {
      await ProductosRepoFirestore.crear(
        {
          nombre: `Producto ${i + 1}`,
          stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 1000 },
        },
        g()
      );
    }

    // Cambiar el margen recalcula los precios dentro de la misma operación:
    // `actualizar()` llama a `recalcularPrecios()` al final. Por eso se mide
    // la operación completa, que es lo que la usuaria aprieta una sola vez.
    reiniciarContadores();
    await ParametrosRepoFirestore.actualizar({ margen_defecto_bp: 9000 }, g());
    const { escrituras } = contadores();

    // eslint-disable-next-line no-console
    console.log(`  cambiar el margen con 120 productos: ${escrituras} escrituras`);
    expect(escrituras).toBeGreaterThan(0);
    // Si esto crece por encima de 500, la operación deja de ser atómica. No
    // es grave para ESTA operación, pero tiene que ser una decisión, no una
    // sorpresa: por eso queda medida.
    expect(
      escrituras,
      `cambiar el margen con 120 productos cuesta ${escrituras} escrituras`
    ).toBeLessThan(MAXIMO_LOTE);
  });
});
