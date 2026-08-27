import { describe, it, expect } from 'vitest';
import {
  repartirMayorResiduo,
  calcularLiquidacionLote,
  ItemProrrateoInput,
  CostoLoteInput,
} from '../src/core/prorrateo';

describe('src/core/prorrateo.ts', () => {
  describe('Prueba de Aceptación Obligatoria (Sección 3.4)', () => {
    it('liquida lote con suma exacta de $288.30 y distribución centavo a centavo', () => {
      const items: ItemProrrateoInput[] = [
        { id: 1, precio_usa_usd_cents: 8000, tax_usa_usd_cents: 560, peso_mlb: 1500 }, // Perfume $80.00 + $5.60, 1.5 lb
        { id: 2, precio_usa_usd_cents: 6000, tax_usa_usd_cents: 420, peso_mlb: 3500 }, // Tenis $60.00 + $4.20, 3.5 lb
        { id: 3, precio_usa_usd_cents: 4000, tax_usa_usd_cents: 280, peso_mlb: 800 },  // Paleta $40.00 + $2.80, 0.8 lb
      ];

      const costos: CostoLoteInput[] = [
        { tipo: 'FLETE', concepto: 'Flete aéreo Miami-Managua', monto_usd_cents: 3770, base: 'PESO' }, // $37.70
        { tipo: 'ARANCEL', concepto: 'Arancel e IVA Aduana', monto_usd_cents: 4800, base: 'VALOR' },   // $48.00
        { tipo: 'CASILLERO', concepto: 'Manejo Casillero', monto_usd_cents: 1000, base: 'PESO' },      // $10.00
      ];

      const resultado = calcularLiquidacionLote(items, costos);

      // Perfume (id: 1) -> flete $9.75 (975), arancel $21.33 (2133), otros $2.59 (259), aterrizado $119.27 (11927)
      const perfume = resultado.items.find((i) => i.id === 1)!;
      expect(perfume.flete_asignado_usd_cents).toBe(975);
      expect(perfume.arancel_asignado_usd_cents).toBe(2133);
      expect(perfume.otros_costos_asignados_usd_cents).toBe(259);
      expect(perfume.costo_aterrizado_total_usd_cents).toBe(11927);

      // Tenis (id: 2) -> flete $22.75 (2275), arancel $16.00 (1600), otros $6.03 (603), aterrizado $108.98 (10898)
      const tenis = resultado.items.find((i) => i.id === 2)!;
      expect(tenis.flete_asignado_usd_cents).toBe(2275);
      expect(tenis.arancel_asignado_usd_cents).toBe(1600);
      expect(tenis.otros_costos_asignados_usd_cents).toBe(603);
      expect(tenis.costo_aterrizado_total_usd_cents).toBe(10898);

      // Paleta (id: 3) -> flete $5.20 (520), arancel $10.67 (1067), otros $1.38 (138), aterrizado $60.05 (6005)
      const paleta = resultado.items.find((i) => i.id === 3)!;
      expect(paleta.flete_asignado_usd_cents).toBe(520);
      expect(paleta.arancel_asignado_usd_cents).toBe(1067);
      expect(paleta.otros_costos_asignados_usd_cents).toBe(138);
      expect(paleta.costo_aterrizado_total_usd_cents).toBe(6005);

      // Gran total = $288.30 (28830)
      // Compras (18000 + 1260 = 19260) + Costos Lote (3770 + 4800 + 1000 = 9570) = 28830
      expect(resultado.gran_total_usd_cents).toBe(28830);
      expect(resultado.compras_total_usd_cents).toBe(19260);
      expect(resultado.costos_lote_total_usd_cents).toBe(9570);

      const sumaItems = resultado.items.reduce(
        (acc, item) => acc + item.costo_aterrizado_total_usd_cents,
        0
      );
      expect(sumaItems).toBe(28830);
    });
  });

  describe('Casos Borde de repartirMayorResiduo (C3)', () => {
    it('maneja base_total === 0 repartiendo a partes iguales por unidad', () => {
      const bases = [
        { id: 1, base_valor: 0 },
        { id: 2, base_valor: 0 },
        { id: 3, base_valor: 0 },
      ];
      const resultado = repartirMayorResiduo(1000, bases); // 1000 centavos entre 3
      // 333 + 333 + 333 + 1 = 1000
      expect(resultado.get(1)).toBe(334);
      expect(resultado.get(2)).toBe(333);
      expect(resultado.get(3)).toBe(333);

      const suma = Array.from(resultado.values()).reduce((a, b) => a + b, 0);
      expect(suma).toBe(1000);
    });

    it('devuelve Map vacío si la lista de bases está vacía', () => {
      const resultado = repartirMayorResiduo(5000, []);
      expect(resultado.size).toBe(0);
    });

    it('asigna el 100% exacto cuando hay un solo ítem', () => {
      const bases = [{ id: 42, base_valor: 1500 }];
      const resultado = repartirMayorResiduo(4875, bases);
      expect(resultado.get(42)).toBe(4875);
    });

    it('asigna 0 a cada ítem si el monto total es 0', () => {
      const bases = [
        { id: 1, base_valor: 2000 },
        { id: 2, base_valor: 4000 },
      ];
      const resultado = repartirMayorResiduo(0, bases);
      expect(resultado.get(1)).toBe(0);
      expect(resultado.get(2)).toBe(0);
    });
  });

  describe('Mapeo por tipo vs base (C2)', () => {
    it('asigna CASILLERO y HANDLING a otros_costos aunque tengan base PESO', () => {
      const items: ItemProrrateoInput[] = [
        { id: 1, precio_usa_usd_cents: 5000, tax_usa_usd_cents: 350, peso_mlb: 1000 },
        { id: 2, precio_usa_usd_cents: 5000, tax_usa_usd_cents: 350, peso_mlb: 1000 },
      ];

      const costos: CostoLoteInput[] = [
        { tipo: 'FLETE', concepto: 'Flete aéreo', monto_usd_cents: 1000, base: 'PESO' },
        { tipo: 'CASILLERO', concepto: 'Casillero Miami', monto_usd_cents: 600, base: 'PESO' },
      ];

      const resultado = calcularLiquidacionLote(items, costos);
      const item1 = resultado.items.find((i) => i.id === 1)!;

      // Flete debe ser 500 (de los 1000 de FLETE)
      expect(item1.flete_asignado_usd_cents).toBe(500);
      // Otros costos debe ser 300 (de los 600 de CASILLERO), NO sumado a flete
      expect(item1.otros_costos_asignados_usd_cents).toBe(300);
    });
  });
});
