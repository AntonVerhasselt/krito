"use client";

import { useRef } from "react";
import { useDrawnInView } from "./useDrawnInView";

/** "gratis", circled twice in green pen once the price sheet scrolls into view. */
export function FreeMark() {
  const ref = useRef<HTMLSpanElement>(null);
  const drawn = useDrawnInView(ref, 1, "0px 0px -25% 0px");

  return (
    <span ref={ref} className={`price-word${drawn ? " is-drawn" : ""}`}>
      gratis
      <svg viewBox="0 0 220 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M152 9C112 2 52 4 23 19 3 31 4 62 35 76c38 16 125 13 161-5 26-13 20-46-13-59-22-8-54-9-82-5-35 3-71 10-86 24-13 14-5 40 29 51 44 13 124 7 158-15 22-15 12-44-24-57-20-7-46-7-66-5" />
      </svg>
    </span>
  );
}
