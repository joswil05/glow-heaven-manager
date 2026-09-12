import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  staggerMs?: number;
}

/**
 * Hook reactivo para animar elementos al hacer scroll en pantalla.
 * Aplica la clase 'is-revealed' cuando el elemento o sus hijos con '.scroll-reveal'
 * entran en el viewport, garantizando aceleración por hardware (GPU).
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const containerRef = useRef<T | null>(null);
  const { threshold = 0.08, rootMargin = '0px 0px -30px 0px', staggerMs = 40 } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    // Buscar hijos marcados con .scroll-reveal o auto-asignar al contenedor
    let targets = Array.from(el.querySelectorAll<HTMLElement>('.scroll-reveal'));
    if (targets.length === 0 && el.classList.contains('scroll-reveal')) {
      targets = [el];
    } else if (targets.length === 0) {
      // Si no tiene la clase explícita, registrar hijos directos
      targets = Array.from(el.children) as HTMLElement[];
      targets.forEach((t) => t.classList.add('scroll-reveal'));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        let delayIndex = 0;
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const currentDelay = delayIndex * staggerMs;
            delayIndex++;

            if (currentDelay > 0) {
              setTimeout(() => {
                target.classList.add('is-revealed');
              }, currentDelay);
            } else {
              target.classList.add('is-revealed');
            }
            observer.unobserve(target);
          }
        });
      },
      { threshold, rootMargin }
    );

    targets.forEach((t) => observer.observe(t));

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin, staggerMs]);

  return containerRef;
}
