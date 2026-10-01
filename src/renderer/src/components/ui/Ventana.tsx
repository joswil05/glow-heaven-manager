import React, { useEffect, useState } from 'react';
import { MarcoModal, type MarcoModalProps } from './MarcoModal';
import { Confirmar } from './Confirmar';

/**
 * El marco de una ventana con formulario: todo lo de `MarcoModal`, más la
 * pregunta antes de perder lo escrito.
 *
 * Con `hayCambios`, Escape, el velo, la X y "Cancelar" (si llama a `cerrar`)
 * preguntan "¿Descartar lo que escribiste?", con el foco en "Seguir
 * editando". Sin cambios, cierran de una: preguntar por nada entrena a
 * apretar "Descartar" sin leer.
 *
 * La usan tal cual los editores grandes (Nueva venta, Registrar paquete,
 * Producto), que traen su propio interior; `Dialogo` le agrega título,
 * cuerpo y pie.
 */
export interface VentanaProps extends Omit<MarcoModalProps, 'onPedirCierre'> {
  onCerrar: () => void;
  /** Qué se escribió sin guardar: si hay algo, cerrar pregunta antes. */
  hayCambios?: boolean;
}

export const Ventana: React.FC<VentanaProps> = ({ onCerrar, hayCambios = false, abierto, ...resto }) => {
  const [preguntando, setPreguntando] = useState(false);

  useEffect(() => {
    if (!abierto) setPreguntando(false);
  }, [abierto]);

  return (
    <>
      <MarcoModal
        {...resto}
        abierto={abierto}
        onPedirCierre={() => {
          if (hayCambios) setPreguntando(true);
          else onCerrar();
        }}
      />
      <Confirmar
        abierto={preguntando}
        titulo="¿Descartar lo que escribiste?"
        descripcion="Lo que anotaste en esta ventana no se guardó."
        textoCancelar="Seguir editando"
        textoConfirmar="Descartar"
        peligroso
        onCerrar={() => setPreguntando(false)}
        onConfirmar={() => {
          setPreguntando(false);
          onCerrar();
        }}
      />
    </>
  );
};
