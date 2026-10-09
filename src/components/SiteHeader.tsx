import Link from "next/link";
import type { ReactNode } from "react";

export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="site-header">
      <Link href="/" className="logo-link" aria-label="Krito startpagina">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.svg" alt="Krito" width={128} height={42} />
      </Link>
      {children}
    </header>
  );
}

export function StatusIcon({
  status,
  size = 44,
}: {
  status: "loading" | "covered" | "partial" | "not_found" | "uncertain";
  size?: number;
}) {
  const src = {
    loading: "/brand/loading-blue.svg",
    covered: "/brand/checkmark-green.svg",
    partial: "/brand/partial-amber.svg",
    not_found: "/brand/cross-red.svg",
    uncertain: "/brand/question-orange.svg",
  }[status];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`status-icon status-icon-${status}`}
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}
