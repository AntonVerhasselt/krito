import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./brand";

export { StatusIcon } from "./brand";

export function SiteHeader({
  children,
  sticky = false,
}: {
  children?: ReactNode;
  /** Keep the header at the top while the page scrolls (homepage). */
  sticky?: boolean;
}) {
  return (
    <header className={sticky ? "site-header is-sticky" : "site-header"}>
      <Link href="/" className="logo-link" aria-label="Krito startpagina">
        <Logo />
      </Link>
      {children}
    </header>
  );
}
