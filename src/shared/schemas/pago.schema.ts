import { z } from 'zod';

export const CrearPagoSchema = z.object({
  pedido_id: z.number().int().positive('Debe especificar un pedido válido'),
  monto_cents: z.number().int().positive('El monto debe ser mayor a 0'),
  moneda_pago: z.enum(['COR', 'USD']),
  metodo_pago: z.string().min(2, 'Debe especificar el método de pago'),
  referencia: z.string().trim().optional(),
  verificado: z.boolean().default(false),
  tipo_pago: z.enum(['ANTICIPO', 'SALDO', 'COMPLETO']),
});
