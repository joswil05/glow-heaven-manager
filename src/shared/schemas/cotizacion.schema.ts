import { z } from 'zod';

export const ItemCotizacionSchema = z.object({
  id: z.number().optional(),
  descripcion: z.string().min(2, 'La descripción es obligatoria').trim(),
  tienda_id: z.number().optional(),
  categoria_id: z.number().optional(),
  url: z.string().url().or(z.string().length(0)).optional(),
  precio_usa_usd_cents: z.number().int().nonnegative('El precio debe ser mayor o igual a 0'),
  peso_mlb: z.number().int().nonnegative('El peso debe ser mayor o igual a 0'),
});

export const CrearCotizacionSchema = z.object({
  cliente_id: z.number().int().positive('Debe seleccionar un cliente'),
  items: z.array(ItemCotizacionSchema).min(1, 'Debe agregar al menos un ítem a la cotización'),
  anticipo_bp: z.number().int().min(1000).max(10000).default(5000),
  notas: z.string().trim().optional(),
});
