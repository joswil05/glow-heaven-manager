/**
 * El formato de lo que se escribe en un formulario (`core/formatos.ts`), y
 * que los repositorios lo apliquen al guardar, venga de la app que venga.
 *
 * Salió de la revisión de datos de producción del 30 de septiembre: cuatro
 * formas de anotar un teléfono, marcas invisibles pegadas desde WhatsApp,
 * "Steve Maddem", la ciudad escrita en la dirección y pagos sin hora.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, volcar } from './firestore-fake';
import {
  arreglarMayusculas,
  arreglarMayusculasFrase,
  ERROR_TELEFONO,
  formatearTalla,
  formatearTelefono,
  limpiarLineas,
  limpiarTexto,
  nombrePropio,
} from '../src/core/formatos';
import { telefonoWhatsapp } from '../src/core/telefono';
import { algunoContiene, contiene } from '../src/core/texto';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { hoyISO } from '../src/core/fechas';

const g = () => randomUUID();
/** Lo que WhatsApp pone alrededor de un número al copiarlo. */
const DE_WHATSAPP = '‪+505 7681 0051‬';

describe('formatearTelefono', () => {
  it('un número de Nicaragua sale siempre igual, se escriba como se escriba', () => {
    for (const escrito of ['86012442', '8601 2442', '8601-2442', '+505 8601 2442', '50586012442', '+50586012442', '(505) 8601-2442']) {
      expect(formatearTelefono(escrito), escrito).toBe('+505 8601 2442');
    }
  });

  it('saca las marcas invisibles que WhatsApp pega con el número', () => {
    expect(formatearTelefono(DE_WHATSAPP)).toBe('+505 7681 0051');
  });

  it('uno de otro país conserva su código', () => {
    expect(formatearTelefono('+1 (504) 463-6250')).toBe('+1 504 463 6250');
    expect(formatearTelefono('00506 8888 7777')).toBe('+506 8888 7777');
    expect(formatearTelefono('+34 612 345 678')).toBe('+34612345678');
  });

  it('vacío es null, no un teléfono en blanco', () => {
    expect(formatearTelefono('')).toBeNull();
    expect(formatearTelefono('   ')).toBeNull();
    expect(formatearTelefono(null)).toBeNull();
    expect(formatearTelefono(undefined)).toBeNull();
  });

  it('un dígito de más o de menos no se adivina: se rechaza diciendo qué revisar', () => {
    for (const malo of ['8601244', '860124422', '15044636250', '+12', 'ochenta']) {
      expect(() => formatearTelefono(malo), malo).toThrow(ERROR_TELEFONO);
    }
  });

  it('formatear lo ya formateado no lo cambia', () => {
    for (const t of ['+505 8601 2442', '+1 504 463 6250', '+506 8888 7777']) {
      expect(formatearTelefono(t)).toBe(t);
    }
  });

  it('el enlace de WhatsApp sigue saliendo bien desde el formato nuevo', () => {
    expect(telefonoWhatsapp(formatearTelefono('86012442'))).toBe('50586012442');
    expect(telefonoWhatsapp(formatearTelefono('+1 (504) 463-6250'))).toBe('15044636250');
  });
});

describe('mayúsculas', () => {
  it('un nombre de persona: mayúscula inicial, partículas en minúscula, sin inventar tildes', () => {
    expect(nombrePropio('maría josé DE LA cruz')).toBe('María José de la Cruz');
    expect(nombrePropio('FRYDA LOPEZ')).toBe('Fryda Lopez');
    expect(nombrePropio('  ana   maría  ')).toBe('Ana María');
    expect(nombrePropio('maría-josé')).toBe('María-José');
    expect(nombrePropio("o'neill")).toBe("O'Neill");
    expect(nombrePropio('de la cruz')).toBe('De la Cruz');
    expect(nombrePropio('')).toBe('');
  });

  it('un producto se arregla sólo si viene todo en minúscula o todo en mayúscula', () => {
    expect(arreglarMayusculas('termo stanley')).toBe('Termo Stanley');
    expect(arreglarMayusculas('PACK DE CALZONES CALVIN KLEIN')).toBe('Pack de Calzones Calvin Klein');
    expect(arreglarMayusculas('crema 250 ml')).toBe('Crema 250 ml');
    // Si mezcla, la persona lo escribió así a propósito.
    expect(arreglarMayusculas('Ariana Grande Thank u')).toBe('Ariana Grande Thank u');
    expect(arreglarMayusculas('e.l.f. Paleta')).toBe('e.l.f. Paleta');
    expect(arreglarMayusculas('  Termo   Owala ')).toBe('Termo Owala');
  });

  it('una categoría se escribe como frase', () => {
    expect(arreglarMayusculasFrase('ROPA INTERIOR')).toBe('Ropa interior');
    expect(arreglarMayusculasFrase('skincare')).toBe('Skincare');
    expect(arreglarMayusculasFrase('Bolsos y accesorios')).toBe('Bolsos y accesorios');
  });

  it('la talla va en mayúscula', () => {
    expect(formatearTalla(' xl ')).toBe('XL');
    expect(formatearTalla('m')).toBe('M');
    expect(formatearTalla('')).toBeUndefined();
  });

  it('el texto libre pierde invisibles y espacios de sobra; las notas conservan sus renglones', () => {
    expect(limpiarTexto('Barrio  San​ José ')).toBe('Barrio San José');
    expect(limpiarLineas('  primera   línea \n\n segunda ')).toBe('primera línea\n\nsegunda');
    expect(limpiarLineas('   ')).toBeNull();
  });
});

describe('buscar un teléfono', () => {
  it('se encuentra escribiendo el número como se tenga anotado', () => {
    const campos = ['Michelle Narváez', '+505 7681 0051'];
    for (const busqueda of ['76810051', '7681-0051', '7681 0051', '+505 7681', '0051']) {
      expect(algunoContiene(campos, busqueda), busqueda).toBe(true);
    }
    expect(contiene('+505 7681 0051', '76810051')).toBe(true);
    expect(algunoContiene(campos, '88887777')).toBe(false);
  });

  it('buscar por nombre o código no cambia', () => {
    expect(algunoContiene(['María José', 'V-0012'], 'maria')).toBe(true);
    expect(algunoContiene(['María José', 'V-0012'], 'V-0012')).toBe(true);
    expect(algunoContiene(['María José', 'V-0012'], 'pedro')).toBe(false);
  });
});

describe('los repositorios guardan con formato', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    Parametros.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
  });

  it('una clienta: nombre, teléfono y ciudad, venga de la app que venga', async () => {
    const id = await Clientes.guardar(
      { nombre: '  maría josé  DE LA cruz', telefono: DE_WHATSAPP, ciudad: 'LEÓN', direccion: ' del parque  2c al sur ' },
      g()
    );
    const [doc] = volcar('clientes');
    expect(doc).toMatchObject({
      id,
      nombre: 'María José de la Cruz',
      telefono: '+505 7681 0051',
      ciudad: 'León',
      direccion: 'del parque 2c al sur',
    });

    await Clientes.guardar({ id, nombre: 'María José de la Cruz', telefono: '8601-2442' }, g());
    expect(volcar('clientes')[0].telefono).toBe('+505 8601 2442');
  });

  it('un teléfono que no encaja no guarda nada', async () => {
    await expect(Clientes.guardar({ nombre: 'Ana', telefono: '8601244' }, g())).rejects.toThrow(ERROR_TELEFONO);
    expect(volcar('clientes')).toHaveLength(0);
  });

  it('se la encuentra buscando su teléfono sin espacios', async () => {
    await Clientes.guardar({ nombre: 'Rayza Paniagua', telefono: '82135923' }, g());
    expect((await Clientes.listar('82135923')).map((c) => c.nombre)).toEqual(['Rayza Paniagua']);
  });

  it('un producto: nombre con bloqueo de mayúsculas y tallas en minúscula', async () => {
    const id = await Productos.crear(
      {
        nombre: 'PACK DE CALZONES STEVE MADDEN',
        tiene_variantes: true,
        variantes: [{ talla: 'm', color: 'negro' }, { talla: ' xl ' }],
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 800,
      },
      g()
    );
    const p = (await Productos.getById(id))!;
    expect(p.nombre).toBe('Pack de Calzones Steve Madden');
    expect(p.variantes.map((v) => [v.talla, v.color])).toEqual([['M', 'Negro'], ['XL', undefined]]);

    // Editarlo: el nombre en minúsculas se arregla; la "m" escrita en
    // minúscula es la talla M de antes (conserva su id) y la nueva sale en mayúscula.
    await Productos.actualizar({ id, nombre: 'termo owala', variantes: [{ talla: 'm', color: 'negro' }, { talla: ' s ' }] }, g());
    const editado = (await Productos.getById(id))!;
    expect(editado.nombre).toBe('Termo Owala');
    expect(editado.variantes.map((v) => [v.id, v.talla, v.color])).toEqual([[1, 'M', 'Negro'], [3, 'S', undefined]]);

    await expect(Productos.actualizar({ id, nombre: '   ' }, g())).rejects.toThrow('El producto necesita un nombre.');
  });

  it('la configuración: el teléfono del negocio y el titular de la cuenta', async () => {
    await Parametros.actualizar(
      {
        telefono_negocio: '81105252',
        nombre_negocio: '  Glow   Heaven ',
        cuentas_bancarias: [{ banco: ' Lafise ', moneda: 'USD', numero: '133277582 ', titular: 'ANGIE ROSEMARY LINARTE JARQUIN' }],
      },
      g()
    );
    const p = await Parametros.getParametros();
    expect(p.telefono_negocio).toBe('+505 8110 5252');
    expect(p.nombre_negocio).toBe('Glow Heaven');
    expect(p.cuentas_bancarias).toEqual([{ banco: 'Lafise', moneda: 'USD', numero: '133277582', titular: 'Angie Rosemary Linarte Jarquin' }]);

    await expect(Parametros.actualizar({ telefono_negocio: '811052' }, g())).rejects.toThrow(ERROR_TELEFONO);
  });

  it('una categoría nueva en mayúsculas se escribe como frase', async () => {
    const id = await Parametros.guardarCategoria({ nombre: 'ROPA DEPORTIVA' }, g());
    expect((await Parametros.getCategorias()).find((c) => c.id === id)?.nombre).toBe('Ropa deportiva');
  });

  it('el pago inicial de una venta guarda su hora, como cualquier abono', async () => {
    const cliente = await Clientes.guardar({ nombre: 'Ana' }, g());
    const venta = await Ventas.crear(
      {
        cliente_id: cliente,
        fecha: hoyISO(),
        tipo: 'INVENTARIO',
        lineas: [{ descripcion: 'Pieza suelta', cantidad: 1, precio_unitario_usd_cents: 2000 }],
        pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 1000 },
      },
      g()
    );
    const [pago] = await Pagos.listarPorVenta(venta);
    expect(pago.creado_en).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('la pieza de un encargo escrita en minúscula se guarda con mayúsculas', async () => {
    const cliente = await Clientes.guardar({ nombre: 'Katherine' }, g());
    const encargo = await Ventas.crear(
      {
        cliente_id: cliente,
        fecha: hoyISO(),
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'termo stanley', cantidad: 1, precio_unitario_usd_cents: 4500 }],
      },
      g()
    );
    expect((await Ventas.getById(encargo))!.lineas[0].descripcion).toBe('Termo Stanley');
  });
});
