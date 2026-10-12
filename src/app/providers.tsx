"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useState, type ReactNode } from "react";
import { AnalyticsConsent } from "../components/AnalyticsConsent";
import { AnalyticsLifecycle } from "../components/AnalyticsLifecycle";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("NEXT_PUBLIC_CONVEX_URL ontbreekt. Configureer de ontwikkelomgeving.");
    }
    return new ConvexReactClient(url);
  });

  return <ConvexProvider client={client}><AnalyticsLifecycle />{children}<AnalyticsConsent /></ConvexProvider>;
}
