import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, PlusCircle, Search, Users, X } from 'lucide-react';
import { formatearMoneda } from '@core/moneda';
import type { ClienteDetalle, FilaPorCobrar } from '@shared/types';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import {
  obtenerDatosDashboard,
  invalidarCacheDashboard,
  cacheDashboardGlobal,
} from '../lib/panel-movil';
import { useDatosNegocio } from '../context/DataContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { AbonoModalSheet, type VentaCobroItem } from '../components/AbonoModalSheet';
import { AbonoSelectorSheet } from '../components/AbonoSelectorSheet';
import { KardexClienteSheet, type ClienteKardexInfo } from '../components/KardexClienteSheet';
import { DetalleCobroSheet } from '../components/DetalleCobroSheet';
import { FichaClienta } from '../components/FichaClienta';
import { ClientaFormSheet } from '../components/ClientaFormSheet';
import { filasTeDeben, type FilaTeDeben } from '../lib/clientas';
import { haptics } from '../lib/haptics';
import { hoyISO } from '../lib/util';
import { algunoContiene } from '@core/texto';
import { cordobasQueSeDeben } from '@core/mensajes';
import { diaDeHistorial } from '@core/abonos';

type Lista = 'deben' | 'todas';

/**
 * Todas las clientas, leídas una vez cada 45 s como el panel: la pestaña se
 * abre muchas veces al día y el directorio cambia poco.
 */
let cacheClientas: { datos: ClienteDetalle[]; tiempo: number } | null = null;

async function listarClientas(forzar: boolean): Promise<ClienteDetalle[]> {
  if (!forzar && cacheClientas && Date.now() - cacheClientas.tiempo < 45000) return cacheClientas.datos;
  const datos = await ClientesRepoFirestore.listar();
  cacheClientas = { datos, tiempo: Date.now() };
  return datos;
}

/**
 * Lo que se sabe de una clienta que debe mientras llega su ficha (o sin
 * señal): sin lo que compró en total, la ficha no dice "Ya pagó".
 */
function fichaProvisoria(d: FilaTeDeben): ClienteDetalle {
  return {
    id: d.cliente_id as number,
    nombre: d.nombre,
    telefono: d.telefono,
    activo: true,
    compras_count: d.ventas.length,
    total_comprado_usd_cents: 0,
    saldo_pendiente_usd_cents: d.saldo_usd_cents,
    ultima_compra: d.ultima_compra,
  };
}

/**
 * Clientas (CLI-1): "Te deben", una fila por clienta con lo que debe en
 * total, y "Todas". Tocar a una abre su ficha a pantalla completa (CLI-2).
 */
export function CobranzaView({
  buscar = null,
  activa = true,
}: {
  /** Inicio la abre buscando a una clienta de "Te deben"; `n` cambia en cada toque. */
  buscar?: { texto: string; n: number } | null;
  /** Si se está viendo: el directorio se lee recién cuando hace falta. */
  activa?: boolean;
} = {}) {
  const { parametros, version, marcarCambio } = useDatosNegocio();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const hoy = hoyISO();

  const [cuentas, setCuentas] = useState<FilaPorCobrar[]>(cacheDashboardGlobal.panel?.por_cobrar ?? []);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  const [clientas, setClientas] = useState<ClienteDetalle[] | null>(cacheClientas?.datos ?? null);
  const [errorClientas, setErrorClientas] = useState<string | null>(null);

  const [lista, setLista] = useState<Lista>('deben');
  const [busqueda, setBusqueda] = useState('');

  // La ficha abierta y las hojas que se abren encima de ella.
  const [clientaAbierta, setClientaAbierta] = useState<ClienteDetalle | null>(null);
  const [clientaNueva, setClientaNueva] = useState(false);
  const [sheetAbonoSelectorAbierto, setSheetAbonoSelectorAbierto] = useState(false);
  const [ventaParaCobrar, setVentaParaCobrar] = useState<VentaCobroItem | null>(null);
  const [clienteParaKardex, setClienteParaKardex] = useState<ClienteKardexInfo | null>(null);
  const [detalleCobro, setDetalleCobro] = useState<FilaPorCobrar | null>(null);

  const cargar = useCallback(async (forzar = false) => {
    if (forzar) {
      invalidarCacheDashboard();
    }
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerDatosDashboard(forzar);
      setCuentas(data.panel?.por_cobrar ?? []);
    } catch (err) {
      console.error('[CobranzaView] Error al cargar cuentas por cobrar:', err);
      setError('No se pudieron cargar los cobros.');
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarClientas = useCallback(async (forzar = false) => {
    setErrorClientas(null);
    try {
      setClientas(await listarClientas(forzar));
    } catch (err) {
      console.error('[CobranzaView] Error al cargar las clientas:', err);
      setErrorClientas('No se pudieron cargar las clientas.');
    }
  }, []);

  useEffect(() => {
    cargar(version > 0);
  }, [cargar, version]);

  // El directorio, sólo con la pestaña a la vista: las seis pantallas se
  // montan al abrir la app y no hace falta leerlo si nadie entra.
  useEffect(() => {
    if (activa) void cargarClientas(version > 0);
  }, [activa, cargarClientas, version]);

  // Con algo cambiado (un abono, su ficha), la ficha abierta se pone al día.
  const abiertaId = clientaAbierta?.id;
  useEffect(() => {
    if (abiertaId == null || version === 0) return;
    let vigente = true;
    ClientesRepoFirestore.getById(abiertaId)
      .then((c) => {
        if (vigente && c) setClientaAbierta((actual) => (actual?.id === c.id ? c : actual));
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, [abiertaId, version]);

  useEffect(() => {
    if (!buscar) return;
    setLista('deben');
    setBusqueda(buscar.texto);
  }, [buscar]);

  const totalPorCobrarUsd = useMemo(
    () => cuentas.reduce((acc, c) => acc + (c.saldo_usd_cents || 0), 0),
    [cuentas]
  );
  // Cada deuda con la tasa de su venta, como el detalle de cada una (TRA-04).
  const totalPorCobrarCor = cordobasQueSeDeben(cuentas, tasa);

  const deben = useMemo(() => filasTeDeben(cuentas, clientas ?? []), [cuentas, clientas]);
  const vencidas = deben.filter((d) => d.vencida).length;

  const debenFiltradas = useMemo(
    () =>
      busqueda.trim()
        ? deben.filter((d) => algunoContiene([d.nombre, d.telefono, ...d.ventas.map((v) => v.codigo)], busqueda))
        : deben,
    [deben, busqueda]
  );
  const todasFiltradas = useMemo(
    () =>
      (clientas ?? []).filter((c) => !busqueda.trim() || algunoContiene([c.nombre, c.alias, c.telefono], busqueda)),
    [clientas, busqueda]
  );

  // Al abrir la ficha desde la lista, el pedido más nuevo gana: si la lectura
  // de una llega tarde, no tapa a la que se tocó después.
  const ultimoToque = useRef(0);

  function abrirDeuda(d: FilaTeDeben) {
    haptics.selection();
    if (d.cliente_id == null) {
      // Sin ficha (una venta de mostrador con saldo): su hoja de cobro.
      setDetalleCobro(d.ventas[0] ?? null);
      return;
    }
    const enLista = clientas?.find((c) => c.id === d.cliente_id);
    if (enLista) {
      setClientaAbierta(enLista);
      return;
    }
    const toque = ++ultimoToque.current;
    setClientaAbierta(fichaProvisoria(d));
    ClientesRepoFirestore.getById(d.cliente_id)
      .then((c) => {
        if (c && toque === ultimoToque.current) setClientaAbierta((actual) => (actual?.id === c.id ? c : actual));
      })
      .catch(() => undefined);
  }

  function abrirClienta(c: ClienteDetalle) {
    haptics.selection();
    ++ultimoToque.current;
    setClientaAbierta(c);
  }

  function despuesDeCambiar() {
    marcarCambio();
    cargar(true);
  }

  const chip = (activo: boolean) =>
    `m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
      activo
        ? 'bg-acento text-acento-texto shadow-xs ring-1 ring-acento'
        : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
    }`;
  const cuenta = (activo: boolean) =>
    `text-[10px] py-0.2 px-1.5 rounded-full font-semibold ${
      activo ? 'bg-acento-suave text-acento-fuerte' : 'bg-superficie-3 text-texto-2'
    }`;

  const vacia = (titulo: string, texto: string) => (
    <div className="flex flex-col items-center justify-center py-16 px-4 bg-superficie rounded-2xl border border-borde text-center shadow-xs">
      <div className="w-12 h-12 rounded-full bg-acento-suave text-acento-fuerte flex items-center justify-center mb-2.5">
        <CheckCircle2 size={24} />
      </div>
      <p className="text-sm font-bold text-texto">{titulo}</p>
      <p className="text-xs text-texto-3 mt-1 max-w-xs">{texto}</p>
      {busqueda && (
        <button type="button" onClick={() => setBusqueda('')} className="mt-3 text-xs font-bold text-acento underline">
          Limpiar búsqueda
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2 border border-borde">
              <Users size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">Clientas</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              haptics.impact('light');
              setClientaNueva(true);
            }}
            aria-label="Clienta nueva"
            className="m3-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2/90 text-texto-2 hover:bg-superficie-2 active:scale-95 transition-all border border-borde cursor-pointer"
          >
            <Plus size={17} />
          </button>
        </div>

        <div className="relative mt-2">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-3 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar clienta, venta o teléfono"
            className="w-full h-10 pl-9 pr-9 rounded-xl bg-superficie-2 border border-borde text-xs font-semibold text-texto placeholder:text-texto-3 focus:outline-none focus:ring-2 focus:ring-acento transition-all"
          />
          {busqueda && (
            <button
              type="button"
              aria-label="Borrar la búsqueda"
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-texto-3 hover:text-texto-2 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div role="radiogroup" aria-label="Qué clientas ver" className="flex items-center gap-1.5 mt-2 py-0.5">
          <button
            type="button"
            role="radio"
            aria-checked={lista === 'deben'}
            onClick={() => {
              haptics.selection();
              setLista('deben');
            }}
            className={chip(lista === 'deben')}
          >
            <span>Te deben</span>
            <span className={cuenta(lista === 'deben')}>{deben.length}</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lista === 'todas'}
            onClick={() => {
              haptics.selection();
              setLista('todas');
            }}
            className={chip(lista === 'todas')}
          >
            <span>Todas</span>
            {clientas && <span className={cuenta(lista === 'todas')}>{clientas.length}</span>}
          </button>
        </div>
      </header>

      <PullToRefresh
        onRefresh={async () => {
          await Promise.all([cargar(true), cargarClientas(true)]);
        }}
      >
        <main className="flex flex-col gap-3 px-3.5 pt-3 pb-24 scroll-smooth">
          {lista === 'deben' ? (
            <>
              {error && (
                <div className="rounded-2xl bg-peligro-suave border border-peligro-suave px-4 py-3 text-xs font-semibold text-peligro-fuerte flex items-center justify-between">
                  <span>{error}</span>
                  <button onClick={() => cargar(true)} className="underline">
                    Reintentar
                  </button>
                </div>
              )}

              {/* El total en la calle. El ámbar es la seña de "plata en la
                  calle", como resplandor y no como fondo. */}
              <section
                className="relative overflow-hidden rounded-[24px] border border-alerta/30 bg-superficie p-4 shadow-m3-2"
                style={{
                  backgroundImage:
                    'radial-gradient(130% 110% at 88% -10%, rgb(var(--alerta) / 0.28), transparent 58%),' +
                    'linear-gradient(180deg, rgb(var(--alerta) / 0.07), transparent 45%)',
                }}
              >
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-alerta px-2.5 py-0.5 text-caption font-bold uppercase tracking-wide text-alerta-texto">
                      Total por cobrar en la calle
                    </span>
                    {vencidas > 0 && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-alerta-suave px-2 py-0.5 text-caption font-black text-alerta-fuerte">
                        <AlertTriangle size={10} />
                        {vencidas} {vencidas === 1 ? 'vencida' : 'vencidas'}
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 flex items-baseline gap-2">
                    <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-texto leading-none">
                      {formatearMoneda(totalPorCobrarUsd, 'USD')}
                    </p>
                    <span className="text-xs font-semibold tabular-nums text-texto-3">
                      ≈ {formatearMoneda(totalPorCobrarCor, 'COR')}
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        // Sin señal también: el abono queda en el teléfono (C4).
                        haptics.impact('light');
                        setSheetAbonoSelectorAbierto(true);
                      }}
                      className="m3-press flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 text-body font-bold text-acento-texto active:scale-95 transition-transform cursor-pointer"
                    >
                      <PlusCircle size={16} />
                      <span>Registrar abono</span>
                    </button>
                  </div>
                </div>
              </section>

              {cargando && cuentas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
                  <div className="h-8 w-8 rounded-full border-2 border-alerta-suave border-t-transparent animate-spin" />
                  <p className="text-xs font-medium">Cargando…</p>
                </div>
              ) : debenFiltradas.length === 0 ? (
                busqueda ? (
                  vacia('Nada coincide', `Nadie que deba se llama "${busqueda}".`)
                ) : (
                  vacia('Nadie te debe', 'Cuando una clienta quede debiendo, aparece acá.')
                )
              ) : (
                <div className="flex flex-col gap-2.5">
                  {debenFiltradas.map((d) => (
                    /* Una fila por clienta, no por venta: si debe dos ventas,
                       acá se ve lo que debe en total. */
                    <button
                      key={d.clave}
                      type="button"
                      onClick={() => abrirDeuda(d)}
                      className={`flex w-full items-center gap-3 rounded-2xl border bg-superficie p-3 text-left shadow-xs active:scale-[0.99] transition-transform cursor-pointer ${
                        d.vencida ? 'border-alerta/40' : 'border-borde'
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                          d.vencida
                            ? 'border-alerta-suave bg-alerta-suave text-alerta-fuerte'
                            : 'border-acento-suave bg-acento-suave text-acento-fuerte'
                        }`}
                      >
                        {(d.nombre || 'C').charAt(0).toUpperCase()}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <h2 className="truncate text-body font-bold leading-tight text-texto">{d.nombre}</h2>
                        <p className="truncate text-caption font-medium text-texto-3">
                          {d.ventas.length} {d.ventas.length === 1 ? 'venta' : 'ventas'}
                          {d.ultima_compra ? ` · última compra ${diaDeHistorial(d.ultima_compra, hoy).toLowerCase()}` : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span
                          className={`text-base font-black tabular-nums leading-none ${
                            d.vencida ? 'text-alerta-fuerte' : 'text-texto'
                          }`}
                        >
                          {formatearMoneda(d.saldo_usd_cents, 'USD')}
                        </span>
                        {d.vencida ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-alerta-suave px-2 py-0.5 text-caption font-extrabold text-alerta-fuerte">
                            <AlertTriangle size={10} />
                            Vencida
                          </span>
                        ) : (
                          <span className="text-caption font-semibold text-texto-3">Al día</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : errorClientas && !clientas ? (
            <div className="rounded-2xl bg-peligro-suave border border-peligro-suave px-4 py-3 text-xs font-semibold text-peligro-fuerte flex items-center justify-between">
              <span>{errorClientas}</span>
              <button onClick={() => cargarClientas(true)} className="underline">
                Reintentar
              </button>
            </div>
          ) : !clientas ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
              <div className="h-8 w-8 rounded-full border-2 border-acento-suave border-t-transparent animate-spin" />
              <p className="text-xs font-medium">Cargando…</p>
            </div>
          ) : todasFiltradas.length === 0 ? (
            busqueda ? (
              vacia('Nada coincide', `Ninguna clienta con "${busqueda}".`)
            ) : (
              vacia('Todavía no hay clientas', 'Agregá la primera con el botón +.')
            )
          ) : (
            <div className="m3-card px-3.5 py-1">
              <div className="flex flex-col divide-y divide-borde">
                {todasFiltradas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => abrirClienta(c)}
                    className="tocable flex w-full items-center gap-3 py-2.5 text-left cursor-pointer"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-borde bg-superficie-2 text-xs font-black text-texto-2">
                      {(c.nombre || 'C').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-bold leading-tight text-texto">{c.nombre}</span>
                      <span className="block truncate text-caption text-texto-3">
                        {c.telefono || 'Sin teléfono'}
                        {c.compras_count > 0 ? ` · ${c.compras_count} ${c.compras_count === 1 ? 'compra' : 'compras'}` : ''}
                      </span>
                    </span>
                    {c.saldo_pendiente_usd_cents > 0 && (
                      <span className="shrink-0 text-sm font-black tabular-nums text-texto">
                        Debe {formatearMoneda(c.saldo_pendiente_usd_cents, 'USD')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>
      </PullToRefresh>

      <FichaClienta
        clienta={clientaAbierta}
        porCobrar={cuentas}
        onCerrar={() => {
          ++ultimoToque.current;
          setClientaAbierta(null);
        }}
        onCambio={() => {
          despuesDeCambiar();
          void cargarClientas(true);
        }}
        onVerCobro={(f) => setDetalleCobro(f)}
        onAbonarVenta={(v) => setVentaParaCobrar(v)}
      />

      <ClientaFormSheet
        abierto={clientaNueva}
        onCerrar={() => setClientaNueva(false)}
        onGuardada={(id) => {
          void cargarClientas(true).then(() =>
            ClientesRepoFirestore.getById(id).then((c) => {
              if (c) setClientaAbierta(c);
            })
          );
        }}
      />

      {/* Registrar abono desde el total: buscar clienta o venta. */}
      <AbonoSelectorSheet
        abierto={sheetAbonoSelectorAbierto}
        onCerrar={() => setSheetAbonoSelectorAbierto(false)}
        cuentasPorCobrar={cuentas}
        onSeleccionarVenta={(v) => {
          setVentaParaCobrar(v);
        }}
      />

      <AbonoModalSheet
        venta={ventaParaCobrar}
        onCerrar={() => setVentaParaCobrar(null)}
        onAbonoRegistrado={() => {
          // Actualización optimista local
          if (ventaParaCobrar) {
            setCuentas((prev) => prev.filter((c) => c.venta_id !== ventaParaCobrar.venta_id));
          }
          // Avisa a las demás pestañas: el Inicio mostraba el saldo viejo.
          despuesDeCambiar();
        }}
      />

      {/* La hoja de cobro de una venta: desde su ficha o, sin ficha, desde la lista. */}
      <DetalleCobroSheet
        fila={detalleCobro}
        tasaCambioCents={detalleCobro?.tasa_cambio_cents || tasa}
        onCerrar={() => setDetalleCobro(null)}
        onAbonar={(f) => {
          setDetalleCobro(null);
          setVentaParaCobrar({
            venta_id: f.venta_id,
            codigo: f.codigo,
            cliente_nombre: f.cliente_nombre,
            cliente_telefono: f.cliente_telefono,
            saldo_usd_cents: f.saldo_usd_cents,
            tasa_cambio_cents: f.tasa_cambio_cents,
          });
        }}
        onVerKardex={(f) => {
          setDetalleCobro(null);
          setClienteParaKardex({
            cliente_id: f.cliente_id,
            cliente_nombre: f.cliente_nombre,
            cliente_telefono: f.cliente_telefono,
            saldo_usd_cents: f.saldo_usd_cents,
            venta_id: f.venta_id,
            codigo: f.codigo,
            tasa_cambio_cents: f.tasa_cambio_cents,
          });
        }}
      />

      <KardexClienteSheet
        onCambio={despuesDeCambiar}
        cliente={clienteParaKardex}
        abierto={Boolean(clienteParaKardex)}
        onCerrar={() => setClienteParaKardex(null)}
        onAbonar={(v) => {
          setVentaParaCobrar(v);
        }}
      />
    </div>
  );
}
