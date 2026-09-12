import React, { createContext, useContext } from 'react';

/**
 * Los precios se manejan en dólares. Los córdobas son una conversión para
 * mostrar, con la tasa que el usuario configuró. Vive en un contexto para que
 * ningún componente tenga que recibir la tasa por props hasta el fondo del
 * árbol.
 */
export interface MonedaConfig {
  tasa_cambio_cents: number;
  mostrar_cordobas: boolean;
}

const MonedaContext = createContext<MonedaConfig>({
  tasa_cambio_cents: 3662,
  mostrar_cordobas: true,
});

export const MonedaProvider: React.FC<{
  valor: MonedaConfig;
  children: React.ReactNode;
}> = ({ valor, children }) => (
  <MonedaContext.Provider value={valor}>{children}</MonedaContext.Provider>
);

export function useMoneda(): MonedaConfig {
  return useContext(MonedaContext);
}
