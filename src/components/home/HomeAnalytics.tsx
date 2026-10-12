"use client";

import { useEffect } from "react";
import {
  analyticsAvailable, getAnalyticsConsent, subscribeAnalyticsConsent, track, trackOnce,
} from "../../lib/analytics";

const sections = new Set(["hero", "why", "steps", "example", "scope", "price", "faq", "closing"]);

/** Track trusted public controls, without collecting their text or URLs. */
export function HomeAnalytics() {
  useEffect(() => {
    let stopTracking = () => {};
    function configure() {
      stopTracking();
      if (!analyticsAvailable() || getAnalyticsConsent() !== "granted") return;
      const expanded = new Map<HTMLDetailsElement, boolean>();
      document.querySelectorAll<HTMLDetailsElement>("details[data-faq-id]")
        .forEach((element) => expanded.set(element, element.open));
      function onToggle(event: Event) {
        const element = event.target;
        if (!(element instanceof HTMLDetailsElement) || !expanded.has(element)) return;
        if (expanded.get(element) === element.open) return;
        expanded.set(element, element.open);
        track(element.open ? "faq_opened" : "faq_closed", { faq_id: element.dataset.faqId });
      }
      function onClick(event: MouseEvent) {
        const link = event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[data-external-reference]") : null;
        if (!link) return;
        try { track("external_reference_clicked", { hostname: new URL(link.href).hostname, source: "homepage" }); }
        catch { /* Ignore malformed public reference links. */ }
      }
      const timers = new Map<Element, ReturnType<typeof setTimeout>>();
      const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const pending = timers.get(entry.target);
          if (pending) clearTimeout(pending);
          timers.delete(entry.target);
          if (!entry.isIntersecting || entry.intersectionRatio < 0.65 || document.hidden) continue;
          timers.set(entry.target, setTimeout(() => {
            timers.delete(entry.target);
            if (document.hidden) return;
            const id = entry.target.closest<HTMLElement>("[data-landing-section]")?.dataset.landingSection;
            if (id && sections.has(id)) trackOnce(`landing:${id}`, "landing_section_viewed", { section_id: id });
            observer?.unobserve(entry.target);
          }, 750));
        }
      }, { threshold: [0, 0.65] });
      document.querySelectorAll<HTMLElement>("[data-landing-section]").forEach((section) => {
        const heading = section.querySelector("h1, h2");
        if (heading && sections.has(section.dataset.landingSection ?? "")) observer?.observe(heading);
      });
      document.addEventListener("toggle", onToggle, true);
      document.addEventListener("click", onClick);
      stopTracking = () => {
        observer?.disconnect();
        timers.forEach(clearTimeout);
        document.removeEventListener("toggle", onToggle, true);
        document.removeEventListener("click", onClick);
      };
    }
    configure();
    const unsubscribe = subscribeAnalyticsConsent(configure);
    return () => { unsubscribe(); stopTracking(); };
  }, []);
  return null;
}
