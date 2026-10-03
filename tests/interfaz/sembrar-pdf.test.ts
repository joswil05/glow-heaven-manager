/** Fixtures sintéticas de C2. Sólo corre con vitest.emulador.config.ts. */
import { it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from '../motor-real/arnes';
import { generarHtmlProforma } from '../../src/core/documentos/plantillas';
import { mensajeWhatsappDocumento } from '../../src/core/documentos/mensajes';

it('exporta dos proformas ficticias para comparar el celular con Windows', async () => {
  expect(await emuladorVivo(), 'Debe estar encendido el emulador local').toBe(true);
  await iniciarSesion();
  await baseLimpia();
  const { Clientes, Ventas, Pagos, Parametros } = await repos();
  await Parametros.actualizar({ nombre_negocio: 'Glow Heaven Prueba', telefono_negocio: '8888-0000', tasa_cambio_cents: 3600 }, g());
  const cliente_id = await Clientes.guardar({ nombre: 'María José Pérez Prueba', telefono: '8888-1111' }, g());
  const corta = await Ventas.crear({ cliente_id, fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [
    { descripcion: 'Bolso de edición especial con correa ajustable y cierre metálico', cantidad: 2, precio_unitario_usd_cents: 3000, costo_estimado_unitario_usd_cents: 1770 },
    { descripcion: 'Perfume pequeño · ámbar y jazmín', cantidad: 1, precio_unitario_usd_cents: 2500, costo_estimado_unitario_usd_cents: 1500 },
    { descripcion: 'Sandalias color café · no se consiguió', cantidad: 1, precio_unitario_usd_cents: 2000, costo_estimado_unitario_usd_cents: 1000 },
  ] }, g());
  const inicial = (await Ventas.getById(corta))!;
  await Ventas.cotizar(corta, [{ id: inicial.lineas[2].id, precio_unitario_usd_cents: 2000, descartada: true }], g());
  await Pagos.registrar({ venta_id: corta, fecha: HOY, monto_cents: 72000, moneda: 'COR', metodo: 'EFECTIVO' }, g());
  const larga = await Ventas.crear({ cliente_id, fecha: HOY, tipo: 'ENCARGO', lineas: Array.from({ length: 35 }, (_, i) => ({
    descripcion: `Pieza de prueba ${String(i + 1).padStart(2, '0')} · algodón, color café y descripción larga para revisar el salto de página`,
    cantidad: i % 3 + 1, precio_unitario_usd_cents: 1000 + i * 25, costo_estimado_unitario_usd_cents: 500,
  })) }, g());
  // Los documentos conservaron 36.00; Configuración ahora tiene 37.50.
  await Parametros.actualizar({ tasa_cambio_cents: 3750 }, g());
  const parametros = await Parametros.getParametros();
  const ventas = await Promise.all([Ventas.getById(corta), Ventas.getById(larga)]);
  expect(ventas[0]?.total_usd_cents).toBe(8500);
  expect(ventas[0]?.pagado_usd_cents).toBe(2000);
  await mkdir('scratch/c2-pdf', { recursive: true });
  const fixtures = ventas.map((venta, i) => {
    if (!venta) throw new Error('La fixture no se pudo leer');
    return { nombre: i === 0 ? 'corta' : 'larga', venta, parametros, mensaje: mensajeWhatsappDocumento(venta, parametros) };
  });
  for (const fixture of fixtures) {
    await writeFile(`scratch/c2-pdf/${fixture.nombre}.html`, generarHtmlProforma(fixture.venta, parametros));
  }
  await writeFile('tests/interfaz/fixtures-pdf.json', JSON.stringify(fixtures, null, 2) + '\n');
}, 60_000);
