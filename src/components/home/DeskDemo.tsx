"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** How much of the sheet must be on screen before the pen starts. */
const share = 0.65;

/**
 * The hero sheet. The pen only starts once 65% of the page is in view, so a
 * phone that first shows just its top still sees the whole sheet marked.
 */
export function DeskDemo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [pen, setPen] = useState<"waiting" | "drawn" | "static">("waiting");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let seen: IntersectionObserver | undefined;
    // Rotating a phone or resizing the window changes what can fit on screen.
    const resized = new ResizeObserver(() => watch(el));
    const onResize = () => watch(el);

    function stop() {
      seen?.disconnect();
      resized.disconnect();
      window.removeEventListener("resize", onResize);
    }
    function watch(sheet: HTMLElement) {
      seen?.disconnect();
      if (sheet.getBoundingClientRect().height * share > window.innerHeight) {
        // 65% of this sheet can never be in view: show the marks as written.
        setPen("static");
        stop();
        return;
      }
      seen = new IntersectionObserver(
        ([entry]) => {
          if (entry.intersectionRatio < share) return;
          setPen("drawn");
          stop();
        },
        { threshold: share },
      );
      seen.observe(sheet);
    }

    resized.observe(el);
    window.addEventListener("resize", onResize);
    return stop;
  }, []);

  return (
    <figure ref={ref} className={`desk-demo${pen === "waiting" ? "" : ` is-${pen}`}`}>
      {children}
    </figure>
  );
}
