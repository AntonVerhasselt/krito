"use client";
import { useEffect, useId, useRef, useState } from "react";
import { track } from "../../lib/analytics";
import { focusSearch } from "../BackToSearch";

const links = [
  { href: "#hoe-werkt-het", label: "Hoe werkt het?", hint: "In drie stappen" },
  { href: "#voorbeeld", label: "Voorbeeld", hint: "Magnetisme, 3de leerjaar" },
  { href: "#prijs", label: "Prijs", hint: "Gratis voor elke leerkracht" },
];

/**
 * Homepage menu: links to the sections and a button that opens the search.
 * On small screens the links fold into a menu button; the search button stays visible.
 */
export function SiteNav() {
  const id = useId();
  const [open, setOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        track("mobile_menu_closed", { reason: "escape" });
        setOpen(false);
        nav.current?.querySelector<HTMLButtonElement>(".nav-toggle")?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      if (!nav.current?.contains(e.target as Node)) { track("mobile_menu_closed", { reason: "outside" }); setOpen(false); }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.documentElement.classList.add("nav-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.documentElement.classList.remove("nav-open");
    };
  }, [open]);

  return (
    <nav
      ref={nav}
      className="site-nav"
      aria-label="Hoofdmenu"
      data-open={open || undefined}
    >
      <ul id={`${id}-menu`} className="nav-menu">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} onClick={() => { track("navigation_link_clicked", { destination: l.href.slice(1), source: "header" }); if (open) track("mobile_menu_closed", { reason: "navigation" }); setOpen(false); }}>
              <span className="nav-label">{l.label}</span>
              <span className="nav-hint">{l.hint}</span>
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="primary-button nav-cta"
        onClick={() => {
          track("search_cta_clicked", { source: "header" });
          if (open) track("mobile_menu_closed", { reason: "search" });
          setOpen(false);
          focusSearch();
        }}
      >
        Kies een onderwerp
      </button>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => { track(open ? "mobile_menu_closed" : "mobile_menu_opened", { reason: "toggle" }); setOpen(!open); }}
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
        >
          {open ? (
            <path d="m6 6 12 12M18 6 6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
        <span className="visually-hidden">Menu</span>
      </button>
    </nav>
  );
}
