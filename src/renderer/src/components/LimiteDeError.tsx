import React from 'react';
import { AlertTriangle, RotateCcw, Copy } from 'lucide-react';

/**
 * La red que evita que un error deje la ventana vacía.
 *
 * Hasta acá, cualquier excepción durante el dibujado desmontaba el árbol
 * entero de React: la aplicación quedaba en blanco, sin un mensaje, sin un
 * botón, sin nada que dijera qué había pasado. La única salida era cerrar y
 * volver a abrir, y quien lo sufría no tenía forma de contar qué vio.
 *
 * Esto no arregla el error que se produzca; lo hace visible y deja salir. Que
 * es la diferencia entre "la app se rompió" y "la app dijo que algo se rompió,
 * acá está el detalle, y seguís trabajando".
 *
 * El detalle se puede copiar a propósito: es lo que hace falta para arreglar
 * el problema de verdad, y de memoria nunca se reconstruye.
 */
interface Props {
  children: React.ReactNode;
}

interface Estado {
  error: Error | null;
  detalle: string;
}

export class LimiteDeError extends React.Component<Props, Estado> {
  state: Estado = { error: null, detalle: '' };

  static getDerivedStateFromError(error: Error): Partial<Estado> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Queda en la consola para quien pueda abrirla, y en pantalla para quien no.
    console.error('[LimiteDeError] La interfaz lanzó una excepción:', error, info);
    this.setState({ detalle: `${error.message}\n${info.componentStack ?? ''}`.trim() });
  }

  reiniciar = () => {
    this.setState({ error: null, detalle: '' });
  };

  recargar = () => {
    window.location.reload();
  };

  copiar = () => {
    const texto = this.state.detalle || this.state.error?.message || '';
    navigator.clipboard?.writeText(texto).catch(() => {
      /* Sin portapapeles no se puede hacer más; el texto está en pantalla. */
    });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-fondo p-6">
        <div className="w-full max-w-lg rounded-2xl border border-borde bg-superficie p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-peligro-suave text-peligro">
              <AlertTriangle size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-texto">Algo se rompió en esta pantalla</h1>
              <p className="mt-1 text-sm text-texto-2">
                Tus datos están a salvo: esto pasó al dibujar la pantalla, no al guardar. Podés
                volver e intentar de nuevo.
              </p>
            </div>
          </div>

          <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-borde bg-superficie-2 p-3 text-[11px] leading-relaxed text-texto-3 whitespace-pre-wrap break-words">
            {this.state.detalle || this.state.error.message}
          </pre>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.reiniciar}
              className="inline-flex items-center gap-2 rounded-xl bg-acento px-4 py-2 text-sm font-bold text-acento-texto transition-transform active:scale-[0.97] cursor-pointer"
            >
              <RotateCcw size={15} />
              Volver a intentar
            </button>
            <button
              type="button"
              onClick={this.recargar}
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-superficie-2 px-4 py-2 text-sm font-bold text-texto transition-transform active:scale-[0.97] cursor-pointer"
            >
              Reiniciar la app
            </button>
            <button
              type="button"
              onClick={this.copiar}
              className="inline-flex items-center gap-2 rounded-xl border border-borde bg-superficie-2 px-4 py-2 text-sm font-bold text-texto-2 transition-transform active:scale-[0.97] cursor-pointer"
            >
              <Copy size={15} />
              Copiar el detalle
            </button>
          </div>
        </div>
      </div>
    );
  }
}
