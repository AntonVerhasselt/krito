"use client";

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function BackendHealth() {
  const health = useQuery(api.health.get);
  return (
    <section className="health-panel" aria-label="Verbindingsstatus" aria-live="polite">
      <span className={`status-dot ${health?.environment === "development" ? "connected" : ""}`} />
      <div>
        <p>{health ? "Verbonden met de ontwikkelomgeving" : "Verbinding controleren…"}</p>
        {health && <small>{health.environment} · {health.apiRevision}</small>}
      </div>
    </section>
  );
}
