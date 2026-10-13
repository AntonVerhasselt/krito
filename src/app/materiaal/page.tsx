import type { Metadata } from "next";
import { MaterialStep } from "@/components/MaterialStep";
import { noIndex } from "@/lib/site";

export const metadata: Metadata = { title: "Voeg je lesmateriaal toe", robots: noIndex };

export default function MaterialPage() {
  return <MaterialStep />;
}
