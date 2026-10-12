"use client";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { safeError } from "../lib/safeError";
import { StatusIcon } from "./brand";

/**
 * Unsubscribing takes a click: school mail filters open every link in an
 * e-mail in advance, so merely visiting this page must change nothing.
 */
export function Unsubscribe() {
  const unsubscribe = useMutation(api.emails.unsubscribe);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle"),
    [error, setError] = useState("");
  const confirmation = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (state === "done") confirmation.current?.focus();
  }, [state]);
  // Always mounted, so screen readers announce the confirmation.
  const status = (
    <p className="visually-hidden" role="status">
      {state === "done" ? "Je bent uitgeschreven." : ""}
    </p>
  );
  if (state === "done")
    return (
      <>
        {status}
        <h1 ref={confirmation} tabIndex={-1}>
          Je bent uitgeschreven
        </h1>
        <p>Bedankt dat je Krito wilde proberen.</p>
      </>
    );
  return (
    <>
      {status}
      <h1>Uitschrijven</h1>
      <p>Wil je geen mails meer van Anton over Krito? Verslagen die je zelf aanvraagt, krijg je nog wel.</p>
      <button
        type="button"
        className="primary-button"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          setError("");
          try {
            await unsubscribe({ token: new URLSearchParams(window.location.search).get("t") ?? "" });
            setState("done");
          } catch (e) {
            setError(safeError(e));
            setState("idle");
          }
        }}
      >
        {state === "busy" ? (
          <>
            <StatusIcon status="loading" size={22} /> Uitschrijven…
          </>
        ) : (
          "Schrijf me uit"
        )}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
