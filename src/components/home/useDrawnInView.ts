"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * True once enough of the element is on screen to watch the pen at work.
 * An element too tall for the viewport starts when it nearly fills it.
 */
export function useDrawnInView(
  ref: RefObject<Element | null>,
  share: number,
  rootMargin = "0px",
) {
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fits = (0.9 * window.innerHeight) / Math.max(el.getBoundingClientRect().height, 1);
    const threshold = Math.min(share, fits);
    const observer = new IntersectionObserver(
      ([entry]) => {
        // The first callback reports the start state, so check the ratio, not isIntersecting.
        if (entry.intersectionRatio >= threshold - 0.01) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, share, rootMargin]);

  return drawn;
}
