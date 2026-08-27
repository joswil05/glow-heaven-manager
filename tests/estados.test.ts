import { describe, it, expect } from 'vitest';
import {
  validarTransicionItem,
  validarTransicionCotizacion,
  derivarEstadoPedido,
  ItemEstadoDerivadoInput,
} from '../src/core/estados';

describe('src/core/estados.ts - Máquina de Estados y Semáforo', () => {
  describe('Transiciones de Ítem de Pedido', () => {
    it('bloquea el paso a EN_LISTA_USA si el anticipo no está verificado', () => {
      const resultado = validarTransicionItem({
        estado_actual: 'PENDIENTE_ANTICIPO',
        nuevo_estado: 'EN_LISTA_USA',
        anticipo_verificado: false,
        tiene_lote_asignado: false,
        saldo_pendiente_cor_cents: 10000,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo_rechazo).toContain('anticipo');
    });

    it('permite el paso a EN_LISTA_USA si el anticipo está verificado', () => {
      const resultado = validarTransicionItem({
        estado_actual: 'PENDIENTE_ANTICIPO',
        nuevo_estado: 'EN_LISTA_USA',
        anticipo_verificado: true,
        tiene_lote_asignado: false,
        saldo_pendiente_cor_cents: 10000,
      });

      expect(resultado.permitido).toBe(true);
    });

    it('bloquea el paso a EN_TRANSITO si el ítem no tiene lote asignado', () => {
      const resultado = validarTransicionItem({
        estado_actual: 'COMPRADO',
        nuevo_estado: 'EN_TRANSITO',
        anticipo_verificado: true,
        tiene_lote_asignado: false,
        saldo_pendiente_cor_cents: 10000,
      });

      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo_rechazo).toContain('lote');
    });

    it('rechaza transiciones ilegales fuera de la máquina de estados', () => {
      const resultado = validarTransicionItem({
        estado_actual: 'PENDIENTE_ANTICIPO',
        nuevo_estado: 'ENTREGADO',
        anticipo_verificado: false,
        tiene_lote_asignado: false,
        saldo_pendiente_cor_cents: 10000,
      });

      expect(resultado.permitido).toBe(false);
    });
  });

  describe('Ciclo de vida de Cotización (C8)', () => {
    it('permite transiciones legales de cotización', () => {
      expect(validarTransicionCotizacion('BORRADOR', 'ENVIADA').permitido).toBe(true);
      expect(validarTransicionCotizacion('ENVIADA', 'ACEPTADA').permitido).toBe(true);
      expect(validarTransicionCotizacion('ENVIADA', 'RECHAZADA').permitido).toBe(true);
      expect(validarTransicionCotizacion('ENVIADA', 'VENCIDA').permitido).toBe(true);
    });

    it('rechaza transiciones inválidas de cotización', () => {
      expect(validarTransicionCotizacion('ACEPTADA', 'BORRADOR').permitido).toBe(false);
      expect(validarTransicionCotizacion('RECHAZADA', 'ENVIADA').permitido).toBe(false);
    });
  });

  describe('Derivación de Estado del Pedido', () => {
    it('calcula el estado derivado como el más atrasado de los ítems activos', () => {
      const items: ItemEstadoDerivadoInput[] = [
        { id: 1, estado: 'COMPRADO', activo: true },
        { id: 2, estado: 'EN_LISTA_USA', activo: true }, // Más atrasado
        { id: 3, estado: 'COMPRADO', activo: true },
      ];

      const resultado = derivarEstadoPedido(items);
      expect(resultado.estado_derivado).toBe('EN_LISTA_USA');
      expect(resultado.requiere_atencion).toBe(false);
    });

    it('ignora ítems inactivos o CANCELADOS al derivar estado', () => {
      const items: ItemEstadoDerivadoInput[] = [
        { id: 1, estado: 'COMPRADO', activo: true },
        { id: 2, estado: 'CANCELADO', activo: false },
      ];

      const resultado = derivarEstadoPedido(items);
      expect(resultado.estado_derivado).toBe('COMPRADO');
    });

    it('marca requiere_atencion = true si algún ítem está en excepción', () => {
      const items: ItemEstadoDerivadoInput[] = [
        { id: 1, estado: 'COMPRADO', activo: true },
        { id: 2, estado: 'NO_DISPONIBLE', activo: true },
      ];

      const resultado = derivarEstadoPedido(items);
      expect(resultado.requiere_atencion).toBe(true);
      expect(resultado.motivos_atencion.length).toBeGreaterThan(0);
    });
  });
});
