"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Suspense, useState, type ReactNode } from "react";
import { AnalyticsConsent } from "../components/AnalyticsConsent";
import { AnalyticsLifecycle } from "../components/AnalyticsLifecycle";
import { EmailLinkTracker } from "../components/EmailLinkTracker";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL ontbreekt. Configureer de ontwikkelomgeving.");
    }
    return new ConvexReactClient(url, {
      // Convex's default logger calls Math.random during construction, which
      // prevents Next.js from prerendering everything below this provider.
      logger: {
        log: (...args) => console.log(...args),
        warn: (...args) => console.warn(...args),
        error: (...args) => console.error(...args),
        logVerbose: () => {},
      },
    });
  });

  return (
    <ConvexProvider client={client}>
      <Suspense fallback={null}>
        <AnalyticsLifecycle />
      </Suspense>
      <EmailLinkTracker />
      {children}
      <AnalyticsConsent />
    </ConvexProvider>
  );
}
