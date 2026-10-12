/** Krito's own marks: the wordmark, the verdict glyphs and the upload tray. */

export type Status =
  "loading" | "covered" | "partial" | "not_found" | "uncertain";
export type DropState = "empty" | "dragging" | "uploading" | "filled";
export type DropArtProps = {
  state: DropState;
  /** Headline and sub line for the current state. */
  lines: [string, string];
  /** Overall upload progress, 0–100. */
  overall: number;
};

const tick = "M4.3 12.9c1.7 1.2 3.1 2.8 4.4 4.9 2.7-5.2 6.3-9.5 11-12.9";

/** "Krito", underlined once in green pen with a small tick at the end. */
export function Logo() {
  return (
    <span className="pen-logo">
      <span className="pen-logo-word">Krito</span>
      <svg
        className="pen-logo-mark"
        viewBox="0 0 92 16"
        fill="none"
        aria-hidden="true"
      >
        <path d="M2.5 10.2c14.4-2.1 32.8-2.9 50.6-2.4 6.3.2 12 .6 17.3 1.1" />
        <path d="M74.2 8.4c1.8 1.1 3.3 2.6 4.5 4.5 2.9-4.7 6.5-8.4 10.8-11.2" />
      </svg>
    </span>
  );
}

/**
 * Verdicts as pen marks: a tick, a half-filled circle, a cross and a pencil
 * question mark. While a goal is still being checked, the pen writes a line.
 */
export function StatusIcon({
  status,
  size = 44,
}: {
  status: Status;
  size?: number;
}) {
  return (
    <svg
      className={`pen-glyph is-${status}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      {status === "loading" && (
        <>
          <path className="pen-glyph-base" d="M3.5 19.5h17" />
          <path
            className="pen-glyph-write"
            d="M3.6 15.6c1.4-2.4 2.8-4 3.9-2.9 1.1 1.1-.1 3.6 1.4 3.8 1.6.2 2.4-3.9 4.1-4 1.5-.1 1.2 3.2 2.7 3.3 1.3.1 2.1-1.5 3.4-2.5"
            pathLength={1}
          />
        </>
      )}
      {status === "covered" && <path d={tick} pathLength={1} />}
      {status === "partial" && (
        <>
          <path className="pen-glyph-fill" d="M12 4.6a7.4 7.4 0 0 0 0 14.8Z" />
          <path
            d="M12.4 4.6c4.1.1 7.2 3.4 7.1 7.5-.1 4.1-3.4 7.3-7.5 7.3-4.1 0-7.4-3.3-7.4-7.4 0-3.6 2.6-6.6 6-7.3"
            pathLength={1}
          />
        </>
      )}
      {status === "not_found" && (
        <>
          <path d="M6.4 6.2c3.9 3.8 7.6 7.7 11.2 11.7" pathLength={1} />
          <path d="M17.7 6.1c-3.9 3.8-7.6 7.8-11.3 11.9" pathLength={1} />
        </>
      )}
      {status === "uncertain" && (
        <>
          <path
            d="M8.4 8.7c.3-2.5 2.1-4 4.3-3.8 2.3.2 3.7 1.9 3.4 4-.3 2-2.2 2.7-3.3 3.8-.7.7-.9 1.6-.8 2.8"
            pathLength={1}
          />
          <path d="M11.9 18.7l.1.1" pathLength={1} />
        </>
      )}
    </svg>
  );
}

/** The drop zone is an empty sheet tray; added files lie in it as a small stack. */
export function DropArt({ state, lines, overall }: DropArtProps) {
  return (
    <span className="tray-surface">
      <span className={`tray-paper is-${state}`} aria-hidden="true">
        <span className="tray-sheet" />
        <span className="tray-sheet" />
        <span className="tray-sheet">
          <svg className="tray-arrow" viewBox="0 0 40 48" fill="none">
            <path d="M20.4 6c-.3 11.3-.2 22.6.2 33.8" pathLength={1} />
            <path
              d="M10.6 30.4c3.6 3.1 6.8 6.4 9.9 9.9 3-3.6 6.2-7 9.6-10.3"
              pathLength={1}
            />
          </svg>
        </span>
      </span>
      <span className="tray-text">
        <span className="tray-title">{lines[0]}</span>
        <span className="tray-sub">{lines[1]}</span>
      </span>
      {state === "uploading" && (
        <span className="tray-progress" aria-hidden="true">
          <span style={{ width: `${overall}%` }} />
        </span>
      )}
    </span>
  );
}

/** Tick drawn when a search result is chosen. */
export function OptionMark() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none">
      <path d={tick} pathLength={1} />
    </svg>
  );
}
