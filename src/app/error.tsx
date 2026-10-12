"use client";
import { useEffect } from "react";
import { captureAnalyticsError } from "../lib/analytics";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { captureAnalyticsError(error, "route_render", { digest: error.digest }); }, [error]);
  return <main className="site-shell"><div className="result-state">
    <h1>Deze pagina kon niet laden</h1>
    <p>Probeer de pagina opnieuw te laden.</p>
    <button className="primary-button" onClick={retry}>Probeer opnieuw</button>
  </div></main>;
}
