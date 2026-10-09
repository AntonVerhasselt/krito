"use client";

/** Takes the teacher back to the topic search in the hero. */
export function BackToSearch() {
  return (
    <button
      type="button"
      className="primary-button"
      onClick={() => {
        const input = document.querySelector<HTMLInputElement>(
          ".hero [role='combobox']",
        );
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        input?.focus({ preventScroll: true });
      }}
    >
      Kies een onderwerp
    </button>
  );
}
