import type { CSSProperties, ReactNode } from "react";
import { DeskDemo } from "./DeskDemo";

type Ink = "green" | "red";
const delay = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** A phrase marked in pen: underlined or circled. The svg stretches over the phrase. */
function Mark({
  kind,
  at,
  pair,
  ink = "green",
  children,
}: {
  kind: "under" | "circle" | "wave";
  at: number;
  /** Links the passage to its margin note, for the hover. */
  pair: string;
  ink?: Ink;
  children: ReactNode;
}) {
  const path = {
    under: "M2 9.5C40 6.4 90 5.6 150 6.6c16 .3 31 .9 46 1.9",
    wave: "M2 7.5c6-3.5 10 3.5 16 0s10-3.6 16 0 10 3.5 16 0 10-3.6 16 0 10 3.5 16 0 10-3.6 16 0 10 3.5 16 0 10-3.6 16 0 10 3.5 16 0 10-3.6 16 0 10 3.5 16 0 10-3.6 16 0",
    circle:
      "M30 6.5C70 1.8 140 1.4 181 7.6c15 2.4 18 12 6 19.6-18 11-110 13-158 6.2C5 30.5-1 21.6 9.5 13.2 22 3.9 58 2.2 84 2.4",
  }[kind];
  return (
    <span
      className={`mk mk-${kind} ink-${ink}`}
      data-pair={pair}
      style={delay(at)}
    >
      {children}
      <svg
        viewBox={kind === "circle" ? "0 0 200 40" : "0 0 200 12"}
        preserveAspectRatio="none"
        fill="none"
      >
        <path d={path} pathLength={1} />
      </svg>
    </span>
  );
}

function Tick({ at, className = "" }: { at: number; className?: string }) {
  return (
    <svg
      className={`mk-tick ${className}`}
      style={delay(at)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <path
        d="M4.3 12.9c1.7 1.2 3.1 2.8 4.4 4.9 2.7-5.2 6.3-9.5 11-12.9"
        pathLength={1}
      />
    </svg>
  );
}

function Caret({ at }: { at: number }) {
  return (
    <svg className="mk-caret ink-red" style={delay(at)} viewBox="0 0 20 22">
      <path
        d="M3.5 19.5c2.2-4.6 4.4-9.6 6.6-14.6 2 5 4.2 9.8 6.6 14.4"
        pathLength={1}
      />
    </svg>
  );
}

function Note({
  at,
  pair,
  ink = "green",
  children,
}: {
  at: number;
  pair: string;
  ink?: Ink;
  children: ReactNode;
}) {
  return (
    <span className={`mk-note ink-${ink}`} data-pair={pair} style={delay(at)}>
      {children}
    </span>
  );
}

/**
 * A teacher's lesson preparation, read and marked by Krito. Pure illustration:
 * the figcaption carries the meaning for assistive technology. Its headings
 * are styled paragraphs, so they stay out of the page outline.
 */
export function LessonSheet() {
  return (
    <DeskDemo>
      <div className="sheet-stack" aria-hidden="true">
        <div className="sheet sheet-under">
          <div className="doc-head">
            <span>Oefenbundel magnetisme</span>
            <span>Naam: ............................</span>
          </div>
          <p className="doc-q">
            <b>1</b> Kleur de noordpool rood en de zuidpool blauw.
          </p>
          <svg className="doc-magnet" viewBox="0 0 220 44">
            <rect x="1" y="1" width="218" height="42" rx="3" />
            <path d="M110 1v42" />
            <text x="55" y="29">
              N
            </text>
            <text x="165" y="29">
              Z
            </text>
          </svg>
          <p className="doc-q">
            <b>2</b> Trekken deze magneten elkaar aan of stoten ze elkaar af?
          </p>
        </div>

        <article className="sheet sheet-lesson">
          <div className="doc-head">
            <span>Wereldoriëntatie: wetenschap en techniek</span>
            <span>3de leerjaar</span>
          </div>
          <p className="doc-kicker">Magnetisme</p>
          <p className="doc-title">Les 2: Wat trekt een magneet aan?</p>

          <div className="doc-row">
            <div className="doc-main">
              <p className="doc-label">Lesdoelen</p>
              <ul>
                <li>
                  De leerlingen weten dat{" "}
                  <Mark kind="under" at={0.3} pair="poles">
                    gelijke polen elkaar afstoten
                  </Mark>{" "}
                  en tegengestelde polen elkaar aantrekken.
                </li>
                <li>
                  De leerlingen ervaren dat een magneet kracht uitoefent,{" "}
                  <Mark kind="circle" at={0.85} pair="distance">
                    ook zonder aanraking
                  </Mark>
                  .
                </li>
              </ul>
            </div>
            <div className="doc-margin">
              <Note at={0.55} pair="poles">
                GL3.16 <Tick at={0.8} className="in-note" />
              </Note>
              <Note at={1.15} pair="distance">
                GL3.14 kracht op afstand
              </Note>
            </div>
          </div>

          <div className="doc-row is-optional">
            <div className="doc-main">
              <p className="doc-label">Materiaal</p>
              <p>
                Per groep: 2 staafmagneten, een doosje paperclips, een blad
                papier. Voor de klas: een kompas.
              </p>
            </div>
          </div>

          <div className="doc-row">
            <div className="doc-main">
              <p className="doc-label">Proefje</p>
              <div className="doc-box">
                <p>
                  Leg tien paperclips op tafel. Hoeveel paperclips kan je
                  magneet optillen?
                </p>
                <p>
                  Leg nu een blad papier tussen de magneet en de paperclips. Wat
                  merk je?
                </p>
                <Tick at={1.35} className="in-box" />
              </div>
            </div>
          </div>

          <div className="doc-row">
            <div className="doc-main">
              <p className="doc-label">Slot</p>
              <p>
                Kompas tonen:{" "}
                <Mark kind="wave" at={1.45} ink="red" pair="compass">
                  de naald wijst altijd naar het noorden
                </Mark>
                .<Caret at={1.7} />
              </p>
            </div>
            <div className="doc-margin">
              <Note at={1.8} ink="red" pair="compass">
                GL3.19? geen kompasproef
              </Note>
            </div>
          </div>

          <div className="doc-row is-optional">
            <div className="doc-main">
              <p className="doc-label">Verwerking</p>
              <ol>
                <li>
                  Wat gebeurt er als je twee noordpolen naar elkaar duwt?
                  <span className="doc-dots" />
                </li>
                <li>Duid op de tekening de noordpool en de zuidpool aan.</li>
              </ol>
            </div>
          </div>
          <span className="doc-page">2</span>
        </article>
      </div>
      <figcaption className="visually-hidden">
        Een les over magnetisme, nagelezen voor het 3de leerjaar. Groen is
        gevonden, rood ontbreekt.
      </figcaption>
    </DeskDemo>
  );
}
