import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
  staggerMs?: number;
  deps?: unknown[];
}

/**
 * Hook reactivo para animaciones al hacer scroll en interfaces móviles.
 * Utiliza IntersectionObserver con aceleración GPU para 60fps constantes.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const containerRef = useRef<T | null>(null);
  const { threshold = 0.05, rootMargin = '0px 0px -20px 0px', staggerMs = 35, deps = [] } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    let targets = Array.from(el.querySelectorAll<HTMLElement>('.scroll-reveal'));
    if (targets.length === 0 && el.classList.contains('scroll-reveal')) {
      targets = [el];
    } else if (targets.length === 0) {
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
  }, [threshold, rootMargin, staggerMs, ...deps]);

  return containerRef;
}
