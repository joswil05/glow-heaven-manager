/** La versión mostrada al mandar se valida dentro de la transacción real. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { getFirestoreDb } from '../../src/main/firebase/client';
import { etapaEncargo } from '../../src/core/encargos';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('C2: confirmar qué cotización se mandó, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  async function cotizacionInicial() {
    const { Clientes, Ventas } = await repos();
    const cliente = await Clientes.guardar({ nombre: 'Clienta C2 envío' }, g());
    const id = await Ventas.crear({
      cliente_id: cliente, tipo: 'ENCARGO', fecha: HOY,
      lineas: [{ descripcion: 'Bolso C2 envío', cantidad: 1, precio_unitario_usd_cents: 0 }],
    }, g());
    const pieza = (await Ventas.getById(id))!.lineas[0].id;
    await Ventas.cotizar(id, [{ id: pieza, precio_unitario_usd_cents: 3000 }], g());
    expect((await Ventas.getById(id))!.cotizacion_version).toBe(1);
    return { id, pieza };
  }

  async function fotoEventos() {
    const eventos = await getDocs(collection(getFirestoreDb(), 'eventos'));
    return eventos.docs.map((evento) => ({ id: evento.id, ...evento.data() }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  it.skipIf(!disponible)('rechaza la versión anterior sin escribir y permite confirmar la vigente', async () => {
    const { Ventas } = await repos();
    const { id, pieza } = await cotizacionInicial();
    await Ventas.cotizar(id, [{ id: pieza, precio_unitario_usd_cents: 3100 }], g());
    expect((await Ventas.getById(id))!.cotizacion_version).toBe(2);

    const referencia = doc(getFirestoreDb(), 'ventas', String(id));
    const documentoAntes = (await getDoc(referencia)).data();
    const eventosAntes = await fotoEventos();
    const grupoRechazado = g();
    await expect(Ventas.marcarEnviada(id, grupoRechazado, 1))
      .rejects.toThrow(/cotización.*cambi|versión/i);

    // Comparar el documento crudo también detecta cambios ocultos por el DTO,
    // incluido actualizado_en. Un rechazo no deja evento de ningún grupo.
    expect((await getDoc(referencia)).data()).toEqual(documentoAntes);
    expect(await fotoEventos()).toEqual(eventosAntes);
    expect(etapaEncargo((await Ventas.getById(id))!)).toBe('POR_MANDAR');

    const grupoVigente = g();
    await Ventas.marcarEnviada(id, grupoVigente, 2);
    const enviada = (await Ventas.getById(id))!;
    expect(enviada.cotizacion_version).toBe(2);
    expect(enviada.cotizacion_enviada_version).toBe(2);
    expect(enviada.cotizacion_enviada_el).toBe(HOY);
    expect(etapaEncargo(enviada)).toBe('ESPERANDO');
    const eventos = await getDocs(collection(getFirestoreDb(), 'eventos'));
    expect(eventos.docs.filter((evento) => evento.data().evento_grupo_id === grupoRechazado)).toHaveLength(0);
    expect(eventos.docs.filter((evento) => evento.data().evento_grupo_id === grupoVigente)).toHaveLength(1);
  }, 60_000);

  it.skipIf(!disponible)('conserva la llamada anterior sin versión esperada', async () => {
    const { Ventas } = await repos();
    const { id, pieza } = await cotizacionInicial();
    await Ventas.cotizar(id, [{ id: pieza, precio_unitario_usd_cents: 3200 }], g());
    const vigente = (await Ventas.getById(id))!;
    await Ventas.marcarEnviada(id, g());
    const enviada = (await Ventas.getById(id))!;
    expect(enviada.cotizacion_enviada_version).toBe(vigente.cotizacion_version);
    expect(etapaEncargo(enviada)).toBe('ESPERANDO');
  }, 60_000);
});
