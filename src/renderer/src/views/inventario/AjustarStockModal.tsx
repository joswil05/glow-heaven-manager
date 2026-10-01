import React, { useState, useEffect, useRef, useId } from 'react';
import { Button, Field, Input, Ventana } from '../../components/ui';
import { cn } from '../../lib/cn';

/**
 * Conteo físico de una variante.
 *
 * Antes era un `window.prompt`, que no dice qué había antes, no deja ver la
 * diferencia y devuelve texto suelto: escribir "diez" pasaba la validación
 * como cero. Acá el número de ahora está a la vista y el cambio se anuncia
 * antes de aplicarlo.
 */
/**
 * El repositorio guarda un `motivo` en el movimiento de inventario, pero el
 * formulario nunca lo pedia: la interfaz mandaba "Conteo manual" fijo, asi que
 * TODO ajuste quedaba registrado igual — una rotura, un robo, un regalo y una
 * correccion eran indistinguibles en el historial. Para un negocio que sigue
 * su capital en mercaderia, saber por que desaparecieron cinco unidades es
 * justamente el motivo de tener historial.
 *
 * Los motivos dependen de la direccion del ajuste, porque no son los mismos:
 * un producto no se "daña" hacia arriba ni una clienta devuelve hacia abajo.
 */
const MOTIVOS_BAJA = ['Conteo físico', 'Producto dañado', 'Producto perdido', 'Regalo o muestra'];
const MOTIVOS_ALTA = ['Conteo físico', 'Devolución de clienta', 'Corrección de conteo'];

export interface AjusteStock {
  variante_id: number;
  producto_id: number;
  nombre: string;
  actual: number;
}

interface Props {
  ajuste: AjusteStock | null;
  onCerrar: () => void;
  onConfirmar: (ajuste: AjusteStock, nuevas: number, motivo: string) => void;
  /**
   * Lleva a registrar un paquete. Se ofrece cuando se suben unidades: la
   * mercadería que se compró entra por un paquete, con su precio de tienda,
   * su impuesto y su flete. Un ajuste las suma al costo que ya tenía.
   */
  onRegistrarPaquete?: () => void;
}

export const AjustarStockModal: React.FC<Props> = ({
  ajuste,
  onCerrar,
  onConfirmar,
  onRegistrarPaquete,
}) => {
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('Conteo físico');
  const campoRef = useRef<HTMLInputElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (!ajuste) return;
    setTexto(String(ajuste.actual));
    requestAnimationFrame(() => campoRef.current?.select());
  }, [ajuste]);

  const actual = ajuste?.actual ?? 0;
  const nuevas = Number.parseInt(texto, 10);
  const valido = Number.isFinite(nuevas) && nuevas >= 0;
  const diferencia = valido ? nuevas - actual : 0;
  // Un conteo escrito y no guardado: cerrar pregunta antes de perderlo.
  const hayCambios = ajuste !== null && texto.trim() !== String(actual);

  // Si el ajuste cambia de direccion, un motivo de la lista anterior puede
  // quedar fuera de la nueva: se vuelve al valor por defecto.
  const motivosVigentes = diferencia < 0 ? MOTIVOS_BAJA : MOTIVOS_ALTA;
  const motivoAEnviar = motivosVigentes.includes(motivo) ? motivo : 'Conteo físico';

  const aplicar = () => {
    if (!ajuste || !valido) return;
    onConfirmar(ajuste, nuevas, motivoAEnviar);
    onCerrar();
  };

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    aplicar();
  };

  return (
    <Ventana
      abierto={ajuste !== null}
      onCerrar={onCerrar}
      hayCambios={hayCambios}
      onEnviar={aplicar}
      idTitulo={idTitulo}
      clasePanel="rounded-2xl max-w-sm overflow-hidden"
    >
      {(cerrar) => (
      <form onSubmit={enviar}>
        <div className="p-6 space-y-4">
          <div>
            <h3 id={idTitulo} className="text-title font-bold text-texto tracking-tight">
              Ajustar existencias
            </h3>
            <p className="mt-0.5 text-body text-texto-2 font-medium truncate">{ajuste?.nombre}</p>
          </div>

          <Field
            label="¿Cuántas hay?"
            hint={`Registradas: ${actual}`}
            error={texto.trim() && !valido ? 'Tiene que ser 0 o más.' : undefined}
          >
            <Input
              ref={campoRef}
              type="number"
              min="0"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="text-right font-bold text-base"
            />
          </Field>

          {valido && diferencia !== 0 && (
            <div>
              <span className="text-caption font-semibold text-texto-2 block mb-1.5">
                ¿Por qué cambió?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {(diferencia < 0 ? MOTIVOS_BAJA : MOTIVOS_ALTA).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMotivo(m)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-caption font-semibold border cursor-pointer',
                      'transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                      motivo === m
                        ? 'bg-acento text-acento-texto border-acento'
                        : 'bg-superficie-2 text-texto-2 border-borde hover:border-borde-fuerte'
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {valido && diferencia !== 0 && (
            <p
              className={cn(
                'text-label font-semibold tabular',
                diferencia > 0 ? 'text-acento' : 'text-peligro'
              )}
            >
              {diferencia > 0 ? `+${diferencia}` : `−${Math.abs(diferencia)}`}{' '}
              {Math.abs(diferencia) === 1 ? 'unidad' : 'unidades'}
            </p>
          )}

          {valido && diferencia > 0 && (
            <div className="rounded-xl bg-alerta-suave p-3 text-caption text-alerta-fuerte space-y-2">
              <p>
                ¿Llegaron en un paquete? Registralas ahí, así entran con su costo real.
              </p>
              {onRegistrarPaquete && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  onClick={() => {
                    onCerrar();
                    onRegistrarPaquete();
                  }}
                >
                  Registrar paquete
                </Button>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-borde bg-superficie-2/40">
          <Button type="button" variant="secondary" onClick={cerrar} className="rounded-xl">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valido} className="rounded-xl font-semibold shadow-xs">
            Guardar conteo
          </Button>
        </footer>
      </form>
      )}
    </Ventana>
  );
};
