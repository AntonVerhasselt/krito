"use client";
import { useMemo, useSyncExternalStore } from "react";
export type AnalysisSession = { analysisId: string; accessToken: string };
const listeners = new Set<() => void>();
let fallback = "";
function snapshot() {
  try {
    return sessionStorage.getItem("krito-active-analysis") ?? fallback;
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
export function saveSession(session: AnalysisSession | null) {
  fallback = session ? JSON.stringify(session) : "";
  try {
    if (session) {
      sessionStorage.setItem(
        `krito-access-${session.analysisId}`,
        session.accessToken,
      );
      sessionStorage.setItem("krito-active-analysis", fallback);
    } else sessionStorage.removeItem("krito-active-analysis");
  } catch {
    throw new Error("session_storage_unavailable");
  }
  listeners.forEach((listener) => listener());
}
export function useAnalysisSession() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => {
    try {
      const s = JSON.parse(raw);
      return typeof s.analysisId === "string" &&
        /^[a-f0-9]{64}$/.test(s.accessToken)
        ? (s as AnalysisSession)
        : null;
    } catch {
      return null;
    }
  }, [raw]);
}
export function useAccessToken(analysisId: string) {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return sessionStorage.getItem(`krito-access-${analysisId}`) ?? "";
      } catch {
        return "";
      }
    },
    () => "",
  );
}
export async function newCapability() {
  // Confirm refresh persistence before registering any server resources.
  sessionStorage.setItem("krito-storage-probe", "ok");
  sessionStorage.removeItem("krito-storage-probe");
  const accessToken = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(accessToken),
  );
  return {
    accessToken,
    capabilityHash: Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
