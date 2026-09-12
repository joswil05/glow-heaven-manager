/**
 * iOS-style Haptic Feedback Utility para la Web
 *
 * Sigue los lineamientos de Apple Human Interface Guidelines (UIFeedbackGenerator):
 * - Selection: tick ultra-ligero para cambios de pestaña, selectores y chips.
 * - Impact (light, medium, heavy): pulsos físicos para botones, tarjetas y compras.
 * - Notification (success, warning, error): secuencias multitono para confirmar o alertar.
 */

export const haptics = {
  /**
   * Tick ultra-sutil (UISelectionFeedbackGenerator).
   * Ideal para: cambiar de pestaña, seleccionar variante, alternar chips de categoría, +/- cantidad.
   */
  selection() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(8);
      } catch {}
    }
  },

  /**
   * Impacto físico (UIImpactFeedbackGenerator).
   * - light: botones secundarios, cerrar paneles, limpiar inputs.
   * - medium: agregar producto al carrito, seleccionar clienta, 'Pagar todo'.
   * - heavy: botones primarios de acción (Cobrar, Confirmar Venta).
   */
  impact(style: 'light' | 'medium' | 'heavy' = 'medium') {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        const ms = style === 'light' ? 12 : style === 'medium' ? 22 : 35;
        navigator.vibrate(ms);
      } catch {}
    }
  },

  /**
   * Secuencia de éxito estilo iOS (UINotificationFeedbackGenerator - Success):
   * Pequeño pulso preparatorio, micro-pausa y pulso de confirmación firme.
   */
  success() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([12, 45, 22]);
      } catch {}
    }
  },

  /**
   * Secuencia de advertencia (UINotificationFeedbackGenerator - Warning).
   */
  warning() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 55, 25]);
      } catch {}
    }
  },

  /**
   * Secuencia de error estilo iOS (UINotificationFeedbackGenerator - Error):
   * Tres pulsos rápidos que simulan el rechazo físico de una acción.
   */
  error() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([30, 40, 30, 40, 45]);
      } catch {}
    }
  },
};
