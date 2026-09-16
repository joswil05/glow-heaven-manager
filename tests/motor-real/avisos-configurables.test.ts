/**
 * Que los días de aviso sirvan de algo.
 *
 * "Avisarme de encargos a los N días" se podía configurar, se guardaba, y el
 * código usaba siete clavados — el aviso decía literalmente "lleva más de una
 * semana". Lo mismo con los días de mora. Se podía mover el número todo lo que
 * se quisiera y no pasaba nada.
 *
 * Una configuración que miente es peor que una que falta, porque enseña a
 * desconfiar de toda la pantalla de ajustes.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g } from './arnes';
import { haceDias } from '../../src/core/fechas';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/**
 * Un encargo con su anticipo ya cobrado, con la antigüedad que se le pida.
 *
 * El anticipo importa: un encargo sin cobrar todavía es una cotización, y
 * esas no avisan. La alerta es para la plata que ya entró y la mercadería que
 * todavía no llegó.
 */
async function encargoDeHace(dias: number): Promise<number> {
  const { Ventas, Pagos } = await repos();
  const fecha = haceDias(dias);
  const id = await Ventas.crear(
    {
      fecha,
      tipo: 'ENCARGO',
      lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 9000 }],
    },
    g()
  );
  await Pagos.registrar(
    { venta_id: id, fecha, monto_cents: 9000, moneda: 'USD', metodo: 'EFECTIVO' },
    g()
  );
  return id;
}

async function avisosDeEncargo(): Promise<number> {
  const { Panel } = await repos();
  Panel.invalidarCache();
  const alertas = await Panel.alertas();
  return alertas.filter((a) => a.id.startsWith('encargo-')).length;
}

describe('los días de aviso los decide ella', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'un encargo de 8 días avisa con el umbral en 5 y no avisa con el umbral en 20',
    async () => {
      const { Parametros } = await repos();
      await encargoDeHace(8);

      await Parametros.actualizar({ dias_alerta_encargos: 5 }, g());
      Parametros.invalidarCache();
      expect(
        await avisosDeEncargo(),
        'con el umbral en 5 días, un encargo de 8 tiene que avisar'
      ).toBe(1);

      await Parametros.actualizar({ dias_alerta_encargos: 20 }, g());
      Parametros.invalidarCache();
      expect(
        await avisosDeEncargo(),
        'con el umbral en 20 días, un encargo de 8 todavía no molesta'
      ).toBe(0);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'el texto del aviso dice el número que ella eligió, no "una semana"',
    async () => {
      const { Parametros, Panel } = await repos();
      await encargoDeHace(30);

      await Parametros.actualizar({ dias_alerta_encargos: 12 }, g());
      Parametros.invalidarCache();
      Panel.invalidarCache();

      const alertas = await Panel.alertas();
      const aviso = alertas.find((a) => a.id.startsWith('encargo-'));
      expect(aviso).toBeDefined();
      expect(
        aviso!.titulo,
        `el aviso dice "${aviso!.titulo}" y el umbral configurado es 12 días`
      ).toContain('12');
    },
    90_000
  );
});
