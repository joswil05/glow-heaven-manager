import React, { useState, useEffect, useCallback } from 'react';
import { Package, Plus, CheckCircle2, FileEdit, Trash2, Boxes, Truck, Scale, Clock } from 'lucide-react';
import type { Compra, CompraCompleta, Venta, ParametrosSistema } from '../../../shared/types';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Money,
  StatTile,
  DataTable,
  Confirmar,
  type Column,
  type Tone,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { PaqueteEditor } from './paquetes/PaqueteEditor';
import { useToast } from '../context/ToastContext';
import { formatearMoneda, formatearPeso, formatearFecha } from '@core/moneda';

interface PaquetesViewProps {
  parametros: ParametrosSistema | null;
  abrirEditorAlEntrar?: boolean;
  onCambio: () => void;
}

const ESTADO_TONO: Record<string, Tone> = {
  BORRADOR: 'neutral',
  EN_CAMINO: 'warning',
  RECIBIDA: 'success',
};

const ESTADO_TEXTO: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_CAMINO: 'En camino',
  RECIBIDA: 'Recibido',
};

export const PaquetesView: React.FC<PaquetesViewProps> = ({
  parametros,
  abrirEditorAlEntrar = false,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [compras, setCompras] = useState<Compra[]>([]);
  const [encargos, setEncargos] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editorAbierto, setEditorAbierto] = useState(abrirEditorAlEntrar);
  const [compraEditando, setCompraEditando] = useState<CompraCompleta | null>(null);
  const [detalle, setDetalle] = useState<CompraCompleta | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<
    { tipo: 'recibir' | 'archivar'; compra: Compra } | null
  >(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rc, re] = await Promise.all([
        window.api.compras.list(),
        // Encargos que ya se pueden comprar: el anticipo entró.
        window.api.ventas.list({ tipo: 'ENCARGO', estado: 'PENDIENTE' }),
      ]);
      if (rc.success) setCompras(rc.data);
      if (re.success) setEncargos(re.data);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abrirEditorAlEntrar) {
      setCompraEditando(null);
      setEditorAbierto(true);
    }
  }, [abrirEditorAlEntrar]);

  const abrirParaEditar = async (id: number) => {
    const r = await window.api.compras.get(id);
    if (!r.success || !r.data) {
      showToast({ message: 'No se pudo abrir el paquete.', type: 'error' });
      return;
    }
    setCompraEditando(r.data);
    setEditorAbierto(true);
  };

  const verDetalle = async (id: number) => {
    if (detalle?.id === id) {
      setDetalle(null);
      return;
    }
    const r = await window.api.compras.get(id);
    if (r.success && r.data) setDetalle(r.data);
  };

  const recibir = async (c: Compra) => {
    const r = await window.api.compras.recibir(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showToast({
      message: `${c.codigo} recibido. ${r.data.productos_afectados} producto(s) al inventario.`,
      type: 'success',
    });
    await cargar();
    setDetalle(null);
    onCambio();
  };

  const archivar = async (c: Compra) => {
    const r = await window.api.compras.archivar(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(`Paquete ${c.codigo} eliminado`, cargar, r.data.evento_grupo_id);
    await cargar();
    onCambio();
  };

  const enCamino = compras.filter((c) => c.estado === 'EN_CAMINO');
  const invertidoEnCamino = enCamino.reduce((a, c) => a + c.total_usd_cents, 0);
  const recibidos = compras.filter((c) => c.estado === 'RECIBIDA');
  const gastadoTotal = recibidos.reduce((a, c) => a + c.total_usd_cents, 0);

  const columnas: Column<Compra>[] = [
    {
      key: 'codigo',
      header: 'Paquete',
      render: (c) => (
        <div>
          <div className="text-body text-texto">{c.codigo}</div>
          <div className="text-caption text-texto-3">{formatearFecha(c.fecha)}</div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '120px',
      render: (c) => <Badge tone={ESTADO_TONO[c.estado]}>{ESTADO_TEXTO[c.estado]}</Badge>,
    },
    {
      key: 'peso',
      header: 'Peso',
      align: 'right',
      width: '100px',
      render: (c) => (
        <span className="text-label text-texto-2 tabular">
          {formatearPeso(c.peso_total_mlb)}
        </span>
      ),
    },
    {
      key: 'envio',
      header: 'Envío',
      align: 'right',
      width: '130px',
      render: (c) => <Money usd_cents={c.envio_total_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'total',
      header: 'Total pagado',
      align: 'right',
      width: '170px',
      render: (c) => <Money usd_cents={c.total_usd_cents} size="sm" />,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '250px',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          {c.estado !== 'RECIBIDA' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirParaEditar(c.id);
                }}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Editar</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  setPorConfirmar({ tipo: 'recibir', compra: c });
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Recibí</span>
              </Button>
            </>
          ) : (
            <span className="text-caption text-texto-3 mr-1">
              Recibido
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Eliminar ${c.codigo}`}
            title="Eliminar paquete"
            className="text-texto-3 hover:text-danger-600"
            onClick={(e) => {
              e.stopPropagation();
              setPorConfirmar({ tipo: 'archivar', compra: c });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-label text-texto-2">
              Facturas y envíos de courier traídos de USA con su peso en libras y costo de flete.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setCompraEditando(null);
              setEditorAbierto(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Registrar paquete</span>
          </Button>
        </div>

        {compras.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatTile
              label="Gastado en paquetes"
              usd_cents={gastadoTotal}
              tone="purple"
              icon={Boxes}
              hint={`${recibidos.length} paquete${recibidos.length === 1 ? '' : 's'} en tu inventario`}
            />
            {enCamino.length > 0 ? (
              <StatTile
                label="Registrado sin recibir"
                usd_cents={invertidoEnCamino}
                tone="warning"
                icon={Truck}
                hint={`${enCamino.length} paquete${enCamino.length === 1 ? '' : 's'} sin ingresar al inventario`}
              />
            ) : (
              <StatTile
                label="Libras importadas"
                value={formatearPeso(recibidos.reduce((a, c) => a + c.peso_total_mlb, 0))}
                tone="info"
                icon={Scale}
                hint="Total consolidado de todos los paquetes"
              />
            )}
            <StatTile
              label="Encargos por comprar"
              value={encargos.length}
              tone={encargos.length > 0 ? 'warning' : 'success'}
              icon={Clock}
              hint={
                encargos.length > 0
                  ? 'Clientes con anticipo registrado'
                  : 'Sin compras de encargos pendientes'
              }
            />
          </div>
        )}

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando paquetes...</div>
        ) : compras.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Todavía no registraste ningún paquete"
            description="Cuando te llegue un envío, registralo acá con lo que venía adentro, el tax y el envío total. El sistema reparte el costo y arma tu inventario."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setCompraEditando(null);
                  setEditorAbierto(true);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>Registrar el primer paquete</span>
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={compras}
            rowKey={(c) => c.id}
            selectedKey={detalle?.id}
            onRowClick={(c) => verDetalle(c.id)}
          />
        )}
      </div>

      {detalle && (
        <aside className="w-[420px] border-l border-borde bg-superficie overflow-y-auto shrink-0">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-title text-texto">{detalle.codigo}</h3>
                <p className="text-caption text-texto-3">
                  {formatearFecha(detalle.fecha)} · {formatearPeso(detalle.peso_total_mlb)} ·{' '}
                  {detalle.unidades_totales} unidad(es)
                </p>
              </div>
              <Badge tone={ESTADO_TONO[detalle.estado]}>{ESTADO_TEXTO[detalle.estado]}</Badge>
            </div>

            <Card>
              <CardContent className="space-y-2">
                <FilaResumen etiqueta="Productos" usd={detalle.subtotal_productos_usd_cents} />
                <FilaResumen etiqueta="Tax" usd={detalle.tax_total_usd_cents} />
                <FilaResumen etiqueta="Envío" usd={detalle.envio_total_usd_cents} />
                {detalle.otros_costos_usd_cents > 0 && (
                  <FilaResumen etiqueta="Otros gastos" usd={detalle.otros_costos_usd_cents} />
                )}
                <div className="pt-2 border-t border-borde flex items-center justify-between gap-2">
                  <span className="text-body font-medium text-texto">Total pagado</span>
                  <Money usd_cents={detalle.total_usd_cents} size="md" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-2.5 border-b border-borde text-label font-medium text-texto-2">
                  Qué venía adentro
                </div>
                {detalle.lineas.length === 0 ? (
                  <div className="p-5 text-center space-y-2">
                    <p className="text-body font-medium text-texto">
                      Factura de courier registrada
                    </p>
                    <p className="text-caption text-texto-3">
                      Este paquete se registró sin transcripción rápida de productos. Podés cargar los productos desde el módulo de <strong>Inventario</strong> vinculándolos a este paquete para heredar su tarifa de courier.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-borde">
                    {detalle.lineas.map((l) => (
                      <li key={l.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-body text-texto truncate">
                              {l.descripcion}
                            </div>
                            <div className="text-caption text-texto-3">
                              {l.cantidad} unidad(es) · {formatearPeso(l.peso_linea_mlb)}
                            </div>
                          </div>
                          <Badge tone={l.destino === 'ENCARGO' ? 'warning' : 'info'}>
                            {l.destino === 'ENCARGO'
                              ? l.cliente_nombre
                                ? `Encargo: ${l.cliente_nombre}`
                                : 'Encargo'
                              : 'Inventario'}
                          </Badge>
                        </div>

                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption">
                          <Detalle etiqueta="Producto" usd={l.precio_linea_usd_cents} />
                          <Detalle etiqueta="Tax" usd={l.tax_linea_usd_cents} />
                          <Detalle etiqueta="Envío" usd={l.envio_asignado_usd_cents} />
                          <Detalle etiqueta="Costo total" usd={l.costo_linea_usd_cents} fuerte />
                        </dl>

                        {l.cantidad > 1 && (
                          <p className="mt-1 text-caption text-acento-fuerte">
                            Cada unidad te salió en{' '}
                            {formatearMoneda(l.costo_unitario_usd_cents, 'USD')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Button variant="secondary" onClick={() => setDetalle(null)} className="w-full">
              Cerrar detalle
            </Button>
          </div>
        </aside>
      )}

      <Confirmar
        abierto={porConfirmar?.tipo === 'recibir'}
        titulo={`¿Meter ${porConfirmar?.compra.codigo ?? ''} al inventario?`}
        consecuencias={[
          'Cada producto entra con su costo ya repartido.',
          'El paquete queda cerrado: después no se puede editar.',
        ]}
        textoConfirmar="Sí, al inventario"
        onConfirmar={() => porConfirmar && recibir(porConfirmar.compra)}
        onCerrar={() => setPorConfirmar(null)}
      />

      <Confirmar
        abierto={porConfirmar?.tipo === 'archivar'}
        peligroso
        titulo={`¿Eliminar paquete ${porConfirmar?.compra.codigo ?? ''}?`}
        descripcion={
          porConfirmar?.compra.estado === 'RECIBIDA'
            ? 'El paquete se eliminará de la lista activa. Los productos que ya ingresaron a tu inventario no se borrarán.'
            : 'El paquete se eliminará de la lista activa.'
        }
        textoConfirmar="Sí, eliminar"
        onConfirmar={() => porConfirmar && archivar(porConfirmar.compra)}
        onCerrar={() => setPorConfirmar(null)}
      />

      <PaqueteEditor
        abierto={editorAbierto}
        compra={compraEditando}
        encargosPendientes={encargos}
        parametros={parametros}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={async () => {
          await cargar();
          onCambio();
        }}
      />
    </div>
  );
};

const FilaResumen: React.FC<{ etiqueta: string; usd: number }> = ({ etiqueta, usd }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-label text-texto-2">{etiqueta}</span>
    <Money usd_cents={usd} size="sm" soloUsd />
  </div>
);

const Detalle: React.FC<{ etiqueta: string; usd: number; fuerte?: boolean }> = ({
  etiqueta,
  usd,
  fuerte = false,
}) => (
  <>
    <dt className="text-texto-3">{etiqueta}</dt>
    <dd
      className={
        fuerte ? 'text-right text-texto font-semibold tabular' : 'text-right text-texto-2 tabular'
      }
    >
      {formatearMoneda(usd, 'USD')}
    </dd>
  </>
);
