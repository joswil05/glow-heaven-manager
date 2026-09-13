import { ipcMain, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { getMainWindow } from '../windows/main.window';
import { IPC } from '../../shared/ipc-channels';
import type { Resultado } from '../../shared/ipc-contracts';
import { ParametrosRepoFirestore as ParametrosRepo } from '../firebase/repositories/parametros.repo';
import { ProductosRepoFirestore as ProductosRepo } from '../firebase/repositories/productos.repo';
import { ComprasRepoFirestore as ComprasRepo } from '../firebase/repositories/compras.repo';
import { VentasRepoFirestore as VentasRepo } from '../firebase/repositories/ventas.repo';
import { PagosRepoFirestore as PagosRepo } from '../firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as ClientesRepo } from '../firebase/repositories/clientes.repo';
import { PanelRepoFirestore as PanelRepo } from '../firebase/repositories/panel.repo';
import { EventosRepoFirestore as EventosRepo } from '../firebase/repositories/eventos.repo';
import { AccesoServiceFirestore as AccesoService } from '../firebase/services/acceso.service';
import { AccesoFirebase } from '../firebase/auth';
import { GoogleAuthService } from '../firebase/google-auth.service';
import { calcularPrecio } from '../../core/precios';

/**
 * Envuelve un handler para que el renderer nunca vea una excepción cruda.
 * Un error de negocio ya trae un mensaje escrito para una persona; cualquier
 * otra cosa se registra completa y al usuario le llega algo entendible.
 */
function manejar<TArgs extends unknown[], TResultado>(
  canal: string,
  fn: (...args: TArgs) => Promise<TResultado> | TResultado
): void {
  ipcMain.handle(canal, async (_evento, ...args: TArgs): Promise<Resultado<TResultado>> => {
    try {
      return { success: true, data: await fn(...args) };
    } catch (error) {
      const mensaje =
        error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      console.error(`[IPC ${canal}]`, error);
      return { success: false, error: mensaje };
    }
  });
}

/** Cada acción del usuario es un grupo, aunque toque diez documentos. */
function nuevoGrupo(): string {
  return randomUUID();
}

export function registrarHandlers(): void {
  // -------------------------------------------------------------------------
  // Configuración
  // -------------------------------------------------------------------------
  manejar(IPC.PARAMETROS_GET, () => ParametrosRepo.getParametros());

  manejar(IPC.PARAMETROS_UPDATE, async (valores: Record<string, string | number | boolean>) => {
    const evento_grupo_id = nuevoGrupo();
    await ParametrosRepo.actualizar(valores, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(IPC.PARAMETROS_RECALCULAR_PRECIOS, async () => ({
    productos: await ParametrosRepo.recalcularPrecios(),
  }));

  manejar(IPC.CATEGORIAS_LIST, () => ParametrosRepo.getCategorias());

  manejar(IPC.CATEGORIAS_GUARDAR, async (input: Parameters<typeof ParametrosRepo.guardarCategoria>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const id = await ParametrosRepo.guardarCategoria(input, evento_grupo_id);
    return { evento_grupo_id, id };
  });

  manejar(IPC.CATEGORIAS_ARCHIVAR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ParametrosRepo.archivarCategoria(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  // -------------------------------------------------------------------------
  // Inventario
  // -------------------------------------------------------------------------
  manejar(IPC.PRODUCTOS_LIST, (filtros?: Parameters<typeof ProductosRepo.listar>[0]) =>
    ProductosRepo.listar(filtros)
  );

  manejar(IPC.PRODUCTOS_GET, (id: number) => ProductosRepo.getById(id));

  manejar(IPC.PRODUCTOS_CREAR, async (input: Parameters<typeof ProductosRepo.crear>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const id = await ProductosRepo.crear(input, evento_grupo_id);
    return { evento_grupo_id, id };
  });

  manejar(IPC.PRODUCTOS_ACTUALIZAR, async (input: Parameters<typeof ProductosRepo.actualizar>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    await ProductosRepo.actualizar(input, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(
    IPC.PRODUCTOS_AJUSTAR_STOCK,
    async (
      variante_id: number,
      existencias: number,
      motivo?: string,
      producto_id?: number
    ) => {
      // `producto_id` es obligatorio en la práctica: los ids de variante se
      // asignan como `i + 1` DENTRO de cada producto, así que casi todos los
      // productos tienen una variante 1. Este handler lo recibía del renderer
      // y lo descartaba, y entonces el repositorio tenía que adivinar el
      // producto recorriendo la colección: el ajuste terminaba aplicándose al
      // primer producto que tuviera ese id de variante, no al elegido.
      const evento_grupo_id = nuevoGrupo();
      await ProductosRepo.ajustar(
        variante_id,
        existencias,
        evento_grupo_id,
        motivo,
        producto_id
      );
      return { evento_grupo_id };
    }
  );

  manejar(IPC.PRODUCTOS_ARCHIVAR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ProductosRepo.desactivar(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(IPC.PRODUCTOS_REACTIVAR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ProductosRepo.reactivar(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(IPC.PRODUCTOS_ELIMINAR_DEFINITIVO, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ProductosRepo.eliminarDefinitivo(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(IPC.PRODUCTOS_MOVIMIENTOS, (producto_id: number) =>
    ProductosRepo.movimientos(producto_id)
  );

  manejar(IPC.PRODUCTOS_SIMULAR_PRECIO, async (input: Parameters<typeof calcularPrecio>[0]) => {
    const params = await ParametrosRepo.getParametros();
    return calcularPrecio({
      ...input,
      margen_bp: input.margen_bp ?? params.margen_defecto_bp,
      paso_redondeo_usd_cents: params.paso_redondeo_usd_cents,
    });
  });

  // -------------------------------------------------------------------------
  // Paquetes
  // -------------------------------------------------------------------------
  manejar(IPC.COMPRAS_LIST, () => ComprasRepo.listar());
  manejar(IPC.COMPRAS_GET, (id: number) => ComprasRepo.getById(id));

  manejar(IPC.COMPRAS_GUARDAR, async (input: Parameters<typeof ComprasRepo.guardar>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const id = await ComprasRepo.guardar(input, evento_grupo_id);
    return { evento_grupo_id, id };
  });

  manejar(IPC.COMPRAS_PREVISUALIZAR, (input: Parameters<typeof ComprasRepo.previsualizar>[0]) =>
    ComprasRepo.previsualizar(input)
  );

  manejar(IPC.COMPRAS_RECIBIR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    const r = await ComprasRepo.recibir(id, evento_grupo_id);
    return { evento_grupo_id, ...r };
  });

  manejar(IPC.COMPRAS_ARCHIVAR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ComprasRepo.archivar(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  // -------------------------------------------------------------------------
  // Ventas
  // -------------------------------------------------------------------------
  manejar(IPC.VENTAS_LIST, (filtros?: Parameters<typeof VentasRepo.listar>[0]) =>
    VentasRepo.listar(filtros)
  );

  manejar(IPC.VENTAS_GET, (id: number) => VentasRepo.getById(id));

  manejar(IPC.VENTAS_CREAR, async (input: Parameters<typeof VentasRepo.crear>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const id = await VentasRepo.crear(input, evento_grupo_id);
    return { evento_grupo_id, id };
  });

  manejar(
    IPC.VENTAS_CAMBIAR_ESTADO,
    async (id: number, estado: Parameters<typeof VentasRepo.cambiarEstado>[1]) => {
      const evento_grupo_id = nuevoGrupo();
      await VentasRepo.cambiarEstado(id, estado, evento_grupo_id);
      return { evento_grupo_id };
    }
  );

  // -------------------------------------------------------------------------
  // Pagos
  // -------------------------------------------------------------------------
  manejar(IPC.PAGOS_REGISTRAR, async (input: Parameters<typeof PagosRepo.registrar>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const r = await PagosRepo.registrar(input, evento_grupo_id);
    return { evento_grupo_id, ...r };
  });

  manejar(IPC.PAGOS_REGISTRAR_ABONO_CLIENTE, async (input: Parameters<typeof PagosRepo.registrarAbonoCliente>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const r = await PagosRepo.registrarAbonoCliente(input, evento_grupo_id);
    return { evento_grupo_id, ...r };
  });

  manejar(IPC.PAGOS_LISTAR_POR_CLIENTE, (cliente_id: number) => PagosRepo.listarPorCliente(cliente_id));
  manejar(IPC.PAGOS_LISTAR_POR_VENTA, (venta_id: number) => PagosRepo.listarPorVenta(venta_id));

  manejar(IPC.PAGOS_ANULAR, async (pago_id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await PagosRepo.anular(pago_id, evento_grupo_id);
    return { evento_grupo_id };
  });

  manejar(IPC.PAGOS_RECIENTES, (limite?: number) => PagosRepo.recientes(limite));

  // -------------------------------------------------------------------------
  // Clientes
  // -------------------------------------------------------------------------
  manejar(IPC.CLIENTES_LIST, (busqueda?: string) => ClientesRepo.listar(busqueda));
  manejar(IPC.CLIENTES_GET, (id: number) => ClientesRepo.getById(id));

  manejar(IPC.CLIENTES_GUARDAR, async (input: Parameters<typeof ClientesRepo.guardar>[0]) => {
    const evento_grupo_id = nuevoGrupo();
    const id = await ClientesRepo.guardar(input, evento_grupo_id);
    return { evento_grupo_id, id };
  });

  manejar(IPC.CLIENTES_ARCHIVAR, async (id: number) => {
    const evento_grupo_id = nuevoGrupo();
    await ClientesRepo.archivar(id, evento_grupo_id);
    return { evento_grupo_id };
  });

  // -------------------------------------------------------------------------
  // Panel
  // -------------------------------------------------------------------------
  manejar(IPC.PANEL_CARGAR, () => PanelRepo.cargar());

  // -------------------------------------------------------------------------
  // Acceso
  // -------------------------------------------------------------------------
  manejar(IPC.ACCESO_TIENE_PIN, async () => ({ tiene: await AccesoService.tienePin() }));

  manejar(IPC.ACCESO_ESTABLECER_PIN, async (pin: string) => {
    await AccesoService.establecerPin(pin);
    return { ok: true as const };
  });

  manejar(IPC.ACCESO_VERIFICAR_PIN, async (pin: string) => ({
    valido: await AccesoService.verificarPin(pin),
  }));

  manejar(IPC.ACCESO_CAMBIAR_PIN, async (actual: string, nuevo: string) => {
    await AccesoService.cambiarPin(actual, nuevo);
    return { ok: true as const };
  });

  // -------------------------------------------------------------------------
  // Conexión con Firebase
  // -------------------------------------------------------------------------
  manejar(IPC.NUBE_ESTADO, () => AccesoFirebase.estado());
  manejar(IPC.NUBE_CONFIGURAR, (correo: string, clave: string) =>
    AccesoFirebase.configurar(correo, clave)
  );
  manejar(IPC.NUBE_RECONECTAR, () => AccesoFirebase.conectar());

  // -------------------------------------------------------------------------
  // Autenticación con Google
  // -------------------------------------------------------------------------
  manejar(IPC.AUTH_GOOGLE_INICIAR, () => GoogleAuthService.iniciarSesionGoogle());
  manejar(IPC.AUTH_GET_USER, () => GoogleAuthService.obtenerUsuarioActual());
  manejar(IPC.AUTH_LOGOUT, () => GoogleAuthService.cerrarSesion());

  // -------------------------------------------------------------------------
  // Sistema
  // -------------------------------------------------------------------------
  manejar(IPC.SISTEMA_DESHACER, (grupo_id?: string) => EventosRepo.deshacerGrupo(grupo_id));

  manejar(IPC.SISTEMA_INFO, async () => ({
    version: '2.0.0 (Cloud Firestore)',
    ruta_base_datos: 'Firebase Cloud Firestore [glow-heaven-db-app:nam5]',
    tamano_base_datos_bytes: 0,
  }));

  // -------------------------------------------------------------------------
  // Documentos e Impresión
  // -------------------------------------------------------------------------
  manejar(IPC.DOCUMENTOS_IMPRIMIR, async (html: string) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise<void>((resolve, reject) => {
        win.webContents.print(
          {
            silent: false,
            printBackground: true,
            color: true,
          },
          (success, failureReason) => {
            if (!success && failureReason && failureReason !== 'Print job canceled') {
              reject(new Error(failureReason || 'Error al enviar a la impresora'));
            } else {
              resolve();
            }
          }
        );
      });
      return { ok: true };
    } finally {
      if (!win.isDestroyed()) win.close();
    }
  });

  manejar(
    IPC.DOCUMENTOS_GUARDAR_PDF,
    async (input: { html: string; nombreSugerido: string }) => {
      const mainWindow = getMainWindow();
      const options = {
        title: 'Guardar documento como PDF',
        defaultPath: `${input.nombreSugerido || 'Documento'}.pdf`,
        filters: [{ name: 'Documentos PDF (*.pdf)', extensions: ['pdf'] }],
      };
      const saveDialogResult = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);

      if (saveDialogResult.canceled || !saveDialogResult.filePath) {
        return { guardado: false };
      }

      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      try {
        await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(input.html)}`);
        const pdfBuffer = await win.webContents.printToPDF({
          printBackground: true,
          landscape: false,
          pageSize: 'A4',
          margins: {
            top: 0.4,
            bottom: 0.4,
            left: 0.4,
            right: 0.4,
          },
        });

        await fs.writeFile(saveDialogResult.filePath, pdfBuffer);
        return { guardado: true, ruta: saveDialogResult.filePath };
      } finally {
        if (!win.isDestroyed()) win.close();
      }
    }
  );
}
