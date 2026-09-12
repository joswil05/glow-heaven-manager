import { useEffect, useRef } from 'react';

/**
 * Hook para cerrar elementos flotantes, paneles laterales o menús al hacer clic fuera o presionar Escape.
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  activo: boolean,
  onCerrar: () => void,
  ignorarSelectores: string[] = ['[role="menu"]', '[role="dialog"]', '[role="alertdialog"]', '[data-ignorar-afuera]']
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!activo) return;

    const handleMouseDown = (e: MouseEvent) => {
      const el = ref.current;
      if (!el || el.contains(e.target as Node)) return;

      // Si el click fue dentro de un elemento que debe ignorarse (ej. menú contextual o diálogo)
      const target = e.target as HTMLElement;
      for (const selector of ignorarSelectores) {
        if (target.closest && target.closest(selector)) return;
      }

      onCerrar();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCerrar();
      }
    };

    // Retardo breve para evitar que el mismo click de apertura dispare el cierre
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('keydown', handleKeyDown);
    }, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activo, onCerrar, ignorarSelectores]);

  return ref;
}
