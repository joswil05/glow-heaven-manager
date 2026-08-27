import { z } from 'zod';

export const CrearClienteSchema = z.object({
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').trim(),
  alias: z.string().trim().optional(),
  telefono: z.string().min(8, 'El teléfono debe tener al menos 8 dígitos').trim(),
  direccion: z.string().trim().optional(),
  ciudad: z.string().trim().default('León'),
  cedula: z.string().trim().optional(),
  notas: z.string().trim().optional(),
  incumplio_anteriormente: z.boolean().default(false),
});

export const ActualizarClienteSchema = CrearClienteSchema.partial().extend({
  activo: z.boolean().optional(),
});
