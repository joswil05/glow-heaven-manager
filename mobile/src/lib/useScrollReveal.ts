import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  staggerMs?: number;
  deps?: unknown[];
}

/**
 * Hook reactivo para animaciones al hacer scroll en interfaces móviles.
 * Observa únicamente elementos con la clase explícita .scroll-reveal para evitar
 * bloquear u ocultar elementos no deseados ni añadir retrasos artificiales al renderizado.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const containerRef = useRef<T | null>(null);
  const { threshold = 0.05, rootMargin = '0px 0px -20px 0px', deps = [] } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let targets = Array.from(el.querySelectorAll<HTMLElement>('.scroll-reveal'));
    if (targets.length === 0 && el.classList.contains('scroll-reveal')) {
      targets = [el];
    }
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.classList.add('is-revealed');
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
  }, [threshold, rootMargin, ...deps]);

  return containerRef;
}
