"use client";
import { useMemo, useSyncExternalStore } from "react";
type Selection = { catalogVersion: string; goalSetKey: string };
const empty: Selection = { catalogVersion: "", goalSetKey: "" };
const listeners = new Set<() => void>();
let fallback = "";
function snapshot(): string {
  try {
    return sessionStorage.getItem("krito-topic-selection") ?? fallback;
  } catch {
    return fallback;
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function parse(raw: string): Selection {
  try {
    const value = JSON.parse(raw);
    if (
      typeof value.catalogVersion === "string" &&
      typeof value.goalSetKey === "string"
    )
      return value;
  } catch {}
  return empty;
}
export function useTopicSelection(): [Selection, (next: Selection) => void] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const selection = useMemo(() => parse(raw), [raw]);
  function update(next: Selection) {
    fallback = JSON.stringify(next);
    try {
      sessionStorage.setItem("krito-topic-selection", fallback);
    } catch {}
    listeners.forEach((listener) => listener());
  }
  return [selection, update];
}
