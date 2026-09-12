import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  staggerMs?: number;
}

/**
 * Hook reactivo para animar elementos al hacer scroll en pantalla sin retardos artificiales.
 * Los elementos ya visibles en el viewport se muestran de inmediato, evitando sensación de lentitud.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const containerRef = useRef<T | null>(null);
  const { threshold = 0.05, rootMargin = '0px 0px -20px 0px' } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    // Solo observar elementos que tengan la clase explícita .scroll-reveal
    const targets = Array.from(el.querySelectorAll<HTMLElement>('.scroll-reveal'));
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
  }, [threshold, rootMargin]);

  return containerRef;
}
