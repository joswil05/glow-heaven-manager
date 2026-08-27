import { registerParametrosHandlers } from './parametros.handler';
import { registerClientesHandlers } from './clientes.handler';
import { registerCotizacionesHandlers } from './cotizaciones.handler';
import { registerPedidosHandlers } from './pedidos.handler';
import { registerPagosHandlers } from './pagos.handler';
import { registerVistasHandlers } from './vistas.handler';
import { registerSistemaHandlers } from './sistema.handler';
import { registerAdjuntosHandlers } from './adjuntos.handler';

export function registerAllIpcHandlers(): void {
  registerParametrosHandlers();
  registerClientesHandlers();
  registerCotizacionesHandlers();
  registerPedidosHandlers();
  registerPagosHandlers();
  registerVistasHandlers();
  registerSistemaHandlers();
  registerAdjuntosHandlers();
}
