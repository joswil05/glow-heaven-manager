/**
 * Buscar una venta vieja, ahora que las listas abren acotadas.
 *
 * Acotar las listas al mes en curso resolvió el costo, pero abrió un agujero:
 * la venta de María de hace ocho meses dejó de estar en pantalla. Si la única
 * forma de encontrarla fuera traer la historia entera, habríamos vuelto al
 * punto de partida con un paso extra.
 *
 * La idea de la búsqueda es no escanear sino RESOLVER: traducir lo que se
 * escribió a algo que la base sabe responder de una sola vez.
 *
 *   · Un código de venta es el número de esa venta: se pide ese documento.
 *   · Un nombre de clienta se resuelve contra el directorio, y después se
 *     piden SUS ventas, que están indexadas por clienta y no se acotan por
 *     fecha.
 *
 * Estas pruebas fijan las dos mitades: que la ventana efectivamente esconde lo
 * viejo (si no, no habría nada que resolver) y que la búsqueda lo encuentra
 * igual, sin pagar la historia entera.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g } from './arnes';
import { hoyISO, mesISO, haceDias } from '../../src/core/fechas';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

const primeroDelMes = () => `${mesISO()}-01`;

describe('encontrar una venta vieja', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'la ventana del mes esconde lo viejo, y la búsqueda por clienta lo recupera',
    async () => {
      const { Ventas, Clientes } = await repos();

      const maria = await Clientes.guardar({ nombre: 'María López' }, g());
      const otra = await Clientes.guardar({ nombre: 'Beatriz Soto' }, g());

      // Una compra de hace ocho meses y una de hoy.
      const vieja = await Ventas.crear(
        {
          cliente_id: maria,
          fecha: haceDias(240),
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 9000 }],
        },
        g()
      );
      await Ventas.crear(
        {
          cliente_id: otra,
          fecha: hoyISO(),
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Labial', cantidad: 1, precio_unitario_usd_cents: 1200 }],
        },
        g()
      );

      // Lo que muestra la pantalla al abrirse.
      const delMes = await Ventas.listar({ desde: primeroDelMes() });
      expect(
        delMes.some((v) => v.id === vieja),
        'la ventana del mes no debería traer una venta de hace ocho meses'
      ).toBe(false);

      // Lo que hace la búsqueda al escribir "María": resolver a su ficha y
      // pedir SUS ventas, sin recorte de fecha.
      const encontradas = await Clientes.listar('María');
      expect(encontradas).toHaveLength(1);

      const suyas = await Ventas.listar({ cliente_id: encontradas[0].id });
      expect(
        suyas.some((v) => v.id === vieja),
        'buscando por su nombre tiene que aparecer su compra vieja'
      ).toBe(true);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'buscar por código encuentra la venta con una sola lectura',
    async () => {
      const { Ventas } = await repos();

      const vieja = await Ventas.crear(
        {
          fecha: haceDias(300),
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Antigua', cantidad: 1, precio_unitario_usd_cents: 4000 }],
        },
        g()
      );

      const delMes = await Ventas.listar({ desde: primeroDelMes() });
      expect(delMes.some((v) => v.id === vieja)).toBe(false);

      // El código V-0001 ES el número de la venta: se pide el documento.
      const encontrada = await Ventas.getById(vieja);
      expect(encontrada).not.toBeNull();
      expect(encontrada!.codigo).toMatch(/^V-/);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'buscar por clienta trae toda su historia, no sólo lo reciente',
    async () => {
      const { Ventas, Clientes } = await repos();
      const ana = await Clientes.guardar({ nombre: 'Ana Prueba' }, g());

      for (const dias of [400, 200, 90, 10, 0]) {
        await Ventas.crear(
          {
            cliente_id: ana,
            fecha: haceDias(dias),
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario_usd_cents: 1000 }],
          },
          g()
        );
      }

      const suyas = await Ventas.listar({ cliente_id: ana });
      expect(
        suyas.length,
        'la ficha de una clienta muestra todo lo que le vendiste, sin importar cuándo'
      ).toBe(5);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'escribir sin tildes igual encuentra a la clienta',
    async () => {
      // Los nombres del negocio llevan tilde y nadie la escribe al buscar.
      // Si la comparación no las ignora, la clienta existe, está en la lista,
      // y la búsqueda contesta que no hay nada.
      const { Ventas, Clientes } = await repos();
      const maria = await Clientes.guardar({ nombre: 'María Núñez' }, g());
      const vieja = await Ventas.crear(
        {
          cliente_id: maria,
          fecha: haceDias(200),
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 9000 }],
        },
        g()
      );

      for (const escrito of ['maria', 'MARIA', 'nunez', 'María', 'Núñez']) {
        const encontradas = await Clientes.listar(escrito);
        expect(
          encontradas.map((c) => c.id),
          `escribiendo '${escrito}' no apareció María Núñez`
        ).toContain(maria);
      }

      const suyas = await Ventas.listar({ cliente_id: maria });
      expect(suyas.some((v) => v.id === vieja)).toBe(true);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'la búsqueda no cuesta la historia entera',
    async () => {
      // Lo que se quiere evitar es haber cambiado "traer todo siempre" por
      // "traer todo cuando buscás".
      const { Ventas, Clientes } = await repos();
      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const beatriz = await Clientes.guardar({ nombre: 'Beatriz' }, g());

      for (let i = 0; i < 30; i++) {
        await Ventas.crear(
          {
            cliente_id: i % 2 === 0 ? ana : beatriz,
            fecha: haceDias(i * 10),
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario_usd_cents: 1000 }],
          },
          g()
        );
      }

      const deAna = await Ventas.listar({ cliente_id: ana });
      const todas = await Ventas.listar({});

      expect(deAna.length).toBe(15);
      expect(
        deAna.length,
        'buscar por clienta trajo tantas ventas como traer todo: no resolvió, escaneó'
      ).toBeLessThan(todas.length);
    },
    90_000
  );
});
