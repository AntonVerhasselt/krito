"use client";
import { useEffect } from "react";
import { captureAnalyticsError } from "../lib/analytics";

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { captureAnalyticsError(error, "global_render", { digest: error.digest }); }, [error]);
  return <html lang="nl"><body style={{ fontFamily: "system-ui", padding: 32 }}>
    <h1>Krito kon niet laden</h1><p>Probeer de pagina opnieuw te laden.</p>
    <button onClick={retry}>Probeer opnieuw</button>
  </body></html>;
}
