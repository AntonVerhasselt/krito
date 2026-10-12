"use client";

/** Scrolls back to the topic search in the hero and puts the cursor in it. */
export function focusSearch() {
  const input = document.querySelector<HTMLInputElement>("[role='combobox']");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  input?.focus({ preventScroll: true });
}

/** Takes the teacher back to the topic search in the hero. */
export function BackToSearch({
  className = "primary-button",
}: {
  className?: string;
}) {
  return (
    <button type="button" className={className} onClick={focusSearch}>
      Kies een onderwerp
    </button>
  );
}
