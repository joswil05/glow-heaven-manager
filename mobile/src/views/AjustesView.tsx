import { useState } from 'react';
import {
  ArrowLeft,
  Sun,
  Moon,
  Monitor,
  Store,
  Package,
  Coins,
  LogOut,
  Check,
  Loader2,
} from 'lucide-react';
import { ParametrosRepoFirestore } from '@repos/parametros.repo';
import { formatearMoneda } from '@core/moneda';
import { parsearDecimal } from '@core/numeros';
import { useTheme, type ThemeMode } from '../context/ThemeContext';
import { useDatosNegocio } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { BottomSheet } from '../components/BottomSheet';
import { useSnackbar } from '../components/Snackbar';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';

/**
 * Ajustes del celular.
 *
 * No es la Configuración de Windows en chico. Windows tiene nueve secciones,
 * y varias no tienen lugar en un mostrador: cuentas bancarias, ganancias por
 * categoría, PIN, exportación y borrado de cuenta son configuración de fondo,
 * de la que se toca sentada y con calma.
 *
 * Acá entra lo que se usa o se consulta DESDE el celular:
 *
 *   - Apariencia: hoy vive escondida en un botón de la cabecera del Inicio.
 *   - El negocio: sale en los comprobantes que se mandan por WhatsApp.
 *   - Stock mínimo: define cuándo el catálogo avisa "queda poco".
 *   - Tasa de cambio: se muestra, no se edita. Cambiarla desde el mostrador
 *     recalcula precios de todo el catálogo, y eso no es una decisión para
 *     tomar con el pulgar entre una clienta y otra.
 *   - Cerrar sesión.
 */
export function AjustesView({ onVolver }: { onVolver: () => void }) {
  const { theme, setTheme } = useTheme();
  const { parametros, recargar } = useDatosNegocio();
  const { usuario, salir } = useAuth();
  const { mostrar } = useSnackbar();

  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState(parametros?.nombre_negocio ?? '');
  const [telefono, setTelefono] = useState(parametros?.telefono_negocio ?? '');
  const [stockMinimo, setStockMinimo] = useState(String(parametros?.stock_minimo_defecto ?? 2));

  const hayCambios =
    nombre !== (parametros?.nombre_negocio ?? '') ||
    telefono !== (parametros?.telefono_negocio ?? '') ||
    stockMinimo !== String(parametros?.stock_minimo_defecto ?? 2);

  // Se valida ANTES de guardar y se rechaza lo inválido, en vez de convertirlo
  // en cero en silencio: un stock mínimo de 0 nunca avisaría de nada.
  const stockValido = (() => {
    const v = parsearDecimal(stockMinimo, { min: 0 });
    return v !== null && Number.isInteger(v);
  })();

  async function guardar() {
    if (!stockValido) {
      mostrar('El stock mínimo tiene que ser un número entero de 0 o más.', 'error');
      return;
    }
    setGuardando(true);
    try {
      await ParametrosRepoFirestore.actualizar(
        {
          nombre_negocio: nombre.trim(),
          telefono_negocio: telefono.trim(),
          stock_minimo_defecto: parsearDecimal(stockMinimo, { min: 0 }) ?? 2,
        },
        nuevoGrupoEvento()
      );
      await recargar();
      haptics.impact('medium');
      mostrar('Ajustes guardados', 'success');
    } catch (err) {
      console.error('[AjustesView] Error guardando parámetros:', err);
      mostrar('No se pudieron guardar los ajustes.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  const TEMAS: { valor: ThemeMode; etiqueta: string; Icono: typeof Sun }[] = [
    { valor: 'light', etiqueta: 'Claro', Icono: Sun },
    { valor: 'dark', etiqueta: 'Oscuro', Icono: Moon },
    { valor: 'system', etiqueta: 'Automático', Icono: Monitor },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-fondo text-texto">
      <header className="shrink-0 z-20 border-b border-borde bg-superficie/95 px-4 pb-2 pt-safe-t shadow-m3-1 backdrop-blur-md">
        <div className="flex items-center gap-2.5 py-1.5">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onVolver();
            }}
            aria-label="Volver"
            className="m3-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto-2 active:scale-95 transition-transform cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <span className="mb-0.5 block text-caption font-bold uppercase leading-none tracking-widest text-texto-3">
              Glow Heaven
            </span>
            <h1 className="truncate text-title font-extrabold leading-tight text-texto">Ajustes</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-3.5 pb-28 pt-3">
        <div className="flex flex-col gap-4">
          {/* --- Apariencia --- */}
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <h2 className="text-caption font-bold uppercase tracking-widest text-texto-3">
              Apariencia
            </h2>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {TEMAS.map(({ valor, etiqueta, Icono }) => {
                const activo = theme === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setTheme(valor);
                    }}
                    className={`tocable flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 text-caption font-bold active:scale-[0.97] transition-transform cursor-pointer ${
                      activo
                        ? 'border-acento bg-acento text-acento-texto'
                        : 'border-borde bg-superficie-2 text-texto-2'
                    }`}
                  >
                    <Icono size={18} />
                    {etiqueta}
                  </button>
                );
              })}
            </div>
          </section>

          {/* --- Tu negocio --- */}
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex items-center gap-2">
              <Store size={15} className="text-texto-3" />
              <h2 className="text-caption font-bold uppercase tracking-widest text-texto-3">
                Tu negocio
              </h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-texto-3">
              Es lo que sale en los comprobantes que mandás por WhatsApp.
            </p>

            <label className="mt-3 block">
              <span className="text-label font-semibold text-texto-2">Nombre</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-borde bg-superficie-2 px-3 text-body font-medium text-texto outline-none transition-[border-color,box-shadow] focus:border-acento focus:ring-2 focus:ring-acento/30"
              />
            </label>

            <label className="mt-2.5 block">
              <span className="text-label font-semibold text-texto-2">Teléfono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputMode="tel"
                className="mt-1 h-11 w-full rounded-xl border border-borde bg-superficie-2 px-3 text-body font-medium text-texto outline-none transition-[border-color,box-shadow] focus:border-acento focus:ring-2 focus:ring-acento/30"
              />
            </label>
          </section>

          {/* --- Inventario --- */}
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-texto-3" />
              <h2 className="text-caption font-bold uppercase tracking-widest text-texto-3">
                Inventario
              </h2>
            </div>
            <label className="mt-3 block">
              <span className="text-label font-semibold text-texto-2">Avisar cuando queden</span>
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  inputMode="numeric"
                  className={`h-11 w-24 rounded-xl border bg-superficie-2 px-3 text-body font-bold tabular-nums text-texto outline-none transition-[border-color,box-shadow] focus:ring-2 ${
                    stockValido
                      ? 'border-borde focus:border-acento focus:ring-acento/30'
                      : 'border-peligro focus:ring-peligro/30'
                  }`}
                />
                <span className="text-body text-texto-2">unidades o menos</span>
              </div>
              {!stockValido && (
                <span className="mt-1 block text-caption font-semibold text-peligro">
                  Tiene que ser un número entero de 0 o más.
                </span>
              )}
            </label>
          </section>

          {/* --- Tasa de cambio: solo lectura, y se explica por qué --- */}
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex items-center gap-2">
              <Coins size={15} className="text-texto-3" />
              <h2 className="text-caption font-bold uppercase tracking-widest text-texto-3">
                Tasa de cambio
              </h2>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-xl font-black tabular-nums text-texto">
                {formatearMoneda(parametros?.tasa_cambio_cents ?? 0, 'COR')}
              </span>
              <span className="text-label text-texto-3">por dólar</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-texto-3">
              Se cambia desde la computadora. Tocarla recalcula los precios de todo el catálogo, y
              esa no es una decisión para tomar entre una clienta y otra.
            </p>
          </section>

          {/* --- Cuenta --- */}
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <h2 className="text-caption font-bold uppercase tracking-widest text-texto-3">Cuenta</h2>
            <p className="mt-1.5 truncate text-body font-semibold text-texto">
              {usuario?.displayName || usuario?.email}
            </p>
            {usuario?.displayName && usuario?.email && (
              <p className="truncate text-caption text-texto-3">{usuario.email}</p>
            )}
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setConfirmandoSalida(true);
              }}
              className="tocable mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-peligro-suave bg-peligro-suave px-4 py-2.5 text-label font-bold text-peligro-fuerte active:scale-[0.98] transition-transform cursor-pointer"
            >
              <LogOut size={15} />
              Cerrar sesión
            </button>
          </section>
        </div>
      </main>

      {/* Guardar solo aparece cuando hay algo que guardar: una barra fija que
          nunca cambia deja de mirarse. */}
      {hayCambios && (
        <div className="shrink-0 border-t border-borde bg-superficie px-3.5 pb-safe-b pt-3">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !stockValido}
            className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
          >
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      )}

      <BottomSheet
        abierto={confirmandoSalida}
        onCerrar={() => setConfirmandoSalida(false)}
        titulo="¿Cerrar sesión?"
        subtitulo="Vas a tener que volver a entrar con Google."
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoSalida(false)}
              className="tocable rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-sm font-bold text-texto-2 active:scale-[0.98] transition-transform cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => salir()}
              className="tocable rounded-2xl bg-peligro px-4 py-3 text-sm font-bold text-peligro-texto active:scale-[0.98] transition-transform cursor-pointer"
            >
              Cerrar sesión
            </button>
          </div>
        }
      >
        <p className="pb-2 text-body text-texto-2">
          Los datos quedan guardados; solo se cierra esta sesión en el teléfono.
        </p>
      </BottomSheet>
    </div>
  );
}
