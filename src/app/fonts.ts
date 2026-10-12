import { Carlito, Reenie_Beanie, Schibsted_Grotesk } from "next/font/google";

/** UI and headings: a precise grotesque with a little character. */
const ui = Schibsted_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--pen-ui",
  preload: false,
  fallback: ["system-ui", "sans-serif"],
});
/** Anything that comes from a teacher's own document (Calibri metrics). */
const doc = Carlito({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--pen-doc",
  preload: false,
  fallback: ["Calibri", "Carlito", "sans-serif"],
});
/** Short margin notes only, never UI text. */
const hand = Reenie_Beanie({
  subsets: ["latin"],
  weight: "400",
  variable: "--pen-hand",
  preload: false,
});

export const fonts = `${ui.variable} ${doc.variable} ${hand.variable}`;
