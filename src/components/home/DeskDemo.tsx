"use client";

import { useRef, type ReactNode } from "react";
import { useDrawnInView } from "./useDrawnInView";

/** The hero sheet. The pen only starts once most of the page is in view. */
export function DeskDemo({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const drawn = useDrawnInView(ref, 0.65);

  return (
    <figure ref={ref} className={`desk-demo${drawn ? " is-drawn" : ""}`}>
      {children}
    </figure>
  );
}
