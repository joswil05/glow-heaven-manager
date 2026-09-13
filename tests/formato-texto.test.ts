import { describe, it, expect } from 'vitest';
import {
  limpiarEspacios,
  formatearNombreEntidad,
  formatearCodigo,
  formatearTextoGeneral,
} from '../src/shared/formatoTexto';

describe('formatoTexto utilidades', () => {
  describe('limpiarEspacios', () => {
    it('elimina espacios en los bordes y colapsa espacios múltiples', () => {
      expect(limpiarEspacios('   hola    mundo   ')).toBe('hola mundo');
      expect(limpiarEspacios('')).toBe('');
    });
  });

  describe('formatearNombreEntidad', () => {
    it('convierte texto en minúsculas a Title Case', () => {
      expect(formatearNombreEntidad('lapiz labial matte')).toBe('Lapiz Labial Matte');
      expect(formatearNombreEntidad('calzones calvin klein')).toBe('Calzones Calvin Klein');
    });

    it('conserva palabras menores en minúsculas si no son la primera', () => {
      expect(formatearNombreEntidad('crema para manos de victoria secret')).toBe(
        'Crema para Manos de Victoria Secret'
      );
      expect(formatearNombreEntidad('de rosa')).toBe('De Rosa');
    });

    it('respeta siglas comunes en mayúsculas', () => {
      expect(formatearNombreEntidad('protector solar con spf 50')).toBe(
        'Protector Solar con SPF 50'
      );
      expect(formatearNombreEntidad('crema corporal de 200 ml')).toBe(
        'Crema Corporal de 200 ML'
      );
    });

    it('maneja textos en mayúsculas completas', () => {
      expect(formatearNombreEntidad('LAPIZ LABIAL ROJO')).toBe('Lapiz Labial Rojo');
    });
  });

  describe('formatearCodigo', () => {
    it('convierte a mayúsculas y limpia espacios', () => {
      expect(formatearCodigo('  pkg-101-a  ')).toBe('PKG-101-A');
      expect(formatearCodigo('tba123456')).toBe('TBA123456');
    });
  });

  describe('formatearTextoGeneral', () => {
    it('aplica sentence case', () => {
      expect(formatearTextoGeneral('   paquete recibido en miami con éxito.  ')).toBe(
        'Paquete recibido en miami con éxito.'
      );
    });
  });
});
