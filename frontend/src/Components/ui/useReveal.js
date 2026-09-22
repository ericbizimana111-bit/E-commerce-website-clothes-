import { useEffect, useRef } from 'react';

/**
 * Fades a section in the first time it scrolls into view.
 * Attach the returned ref to the element and give it the `reveal` class.
 * Falls back to visible when IntersectionObserver is unavailable.
 */
export default function useReveal() {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      node.classList.add('reveal--in');
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
}
