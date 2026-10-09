"use client";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useTopicSelection } from "../lib/useTopicSelection";
import { api } from "../../convex/_generated/api";
import { GoalPreview } from "./GoalPreview";
type Topic = FunctionReturnType<
  typeof api.goals.listGoalSets
>["topics"][number];
function useDebounced(value: string) {
  const [debounced, set] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => set(value), 180);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
export function GoalSetPicker() {
  const catalog = useQuery(api.goals.catalogInfo);
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const [cursor, setCursor] = useState<string | null>(null);
  const [paginationVersion, setPaginationVersion] = useState("");
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [selection, setSelection] = useTopicSelection();
  const [goalOffset, setGoalOffset] = useState(0);
  const [showGoals, setShowGoals] = useState(false);
  const selected = useQuery(
    api.goals.getGoalSet,
    selection.goalSetKey
      ? { catalogVersion: selection.catalogVersion, key: selection.goalSetKey }
      : "skip",
  );
  const matches = useQuery(
    api.goals.listGoalSets,
    catalog
      ? {
          search: query,
          catalogVersion: catalog.version,
          cursor: paginationVersion === catalog.version ? cursor : null,
        }
      : "skip",
  );
  const list = useQuery(
    api.goals.listGoals,
    selected && showGoals
      ? {
          catalogVersion: selected.catalogVersion,
          goalSetKey: selected.key,
          offset: goalOffset,
        }
      : "skip",
  );
  const versionChanged =
    !!catalog &&
    !!selection.catalogVersion &&
    selection.catalogVersion !== catalog.version;
  const activePreviousCursors =
    paginationVersion === catalog?.version ? previousCursors : [];
  function select(topic: Topic) {
    setSelection({
      catalogVersion: topic.catalogVersion,
      goalSetKey: topic.key,
    });
    setGoalOffset(0);
    setShowGoals(false);
  }
  function updateSearch(value: string) {
    setSearch(value);
    setCursor(null);
    setPreviousCursors([]);
    setPaginationVersion(catalog?.version ?? "");
  }
  return (
    <section className="catalog-panel" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">01 / ONDERWERP</span>
          <h2 id="catalog-title">Waar wil je naar kijken?</h2>
          <p>
            Kies een onderwerp en groep. Krito controleert automatisch alle
            leerdoelen die daarbij horen.
          </p>
        </div>
        <span className="catalog-stamp">
          Op.stap {catalog?.version ? `v${catalog.version}` : ""}
          <small>
            {catalog
              ? `${catalog.counts.goals.toLocaleString("nl-BE")} doelen · alle groepen`
              : "Catalogus laden…"}
          </small>
        </span>
      </div>
      {versionChanged && (
        <div className="catalog-notice" role="status">
          Er is een nieuwe catalogus beschikbaar. Je huidige onderwerp hoort bij
          versie {selection.catalogVersion}.{" "}
          <button
            onClick={() => setSelection({ catalogVersion: "", goalSetKey: "" })}
          >
            Kies opnieuw in versie {catalog!.version}
          </button>
        </div>
      )}
      <label className="search-box">
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="10.5"
            cy="10.5"
            r="6.5"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <input
          type="search"
          aria-label="Zoek onderwerpen"
          placeholder="Bijvoorbeeld: breuken, sociale aandacht, 3de leerjaar…"
          value={search}
          onChange={(e) => updateSearch(e.target.value)}
        />
        {search && (
          <button
            className="text-button"
            onClick={() => updateSearch("")}
            aria-label="Wis zoekopdracht"
          >
            Wis
          </button>
        )}
      </label>
      <div className="catalog-toolbar">
        <span>
          {search ? "Gevonden onderwerpen" : "Verken alle onderwerpen"}
        </span>
        <span>
          {selected
            ? `${selected.goalCount} ${selected.goalCount === 1 ? "doel" : "doelen"} in je selectie`
            : "Kies één onderwerp"}
        </span>
      </div>
      {catalog === null && (
        <p className="empty-state">De Op.stap-catalogus wordt klaargezet.</p>
      )}
      {!matches && catalog && (
        <p className="empty-state" role="status">
          Onderwerpen zoeken…
        </p>
      )}
      {matches && (
        <>
          <div className="topic-grid">
            {matches.topics.map((topic) => (
              <button
                className={`topic-result${selected?.key === topic.key ? " active" : ""}`}
                aria-pressed={selected?.key === topic.key}
                key={topic.key}
                onClick={() => select(topic)}
              >
                <strong>{topic.title}</strong>
                <span className="topic-path">
                  {topic.path
                    .slice(0, -1)
                    .map((p) => p.title)
                    .join(" / ")}
                </span>
                <span className="topic-bottom">
                  <span className="group-tag">
                    {topic.group.title}
                    <b title={topic.group.routeTitle}>
                      {topic.group.routeCode}
                    </b>
                  </span>
                  <span>
                    {topic.goalCount}{" "}
                    {topic.goalCount === 1 ? "doel" : "doelen"}{" "}
                    <span aria-hidden="true">
                      {selected?.key === topic.key ? "✓" : "↗"}
                    </span>
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="page-controls">
            {activePreviousCursors.length > 0 && (
              <button
                onClick={() => {
                  setCursor(activePreviousCursors.at(-1) ?? null);
                  setPreviousCursors(activePreviousCursors.slice(0, -1));
                }}
              >
                ← Vorige onderwerpen
              </button>
            )}
            {matches.more && (
              <button
                onClick={() => {
                  setPreviousCursors([
                    ...activePreviousCursors,
                    paginationVersion === catalog?.version ? cursor : null,
                  ]);
                  setPaginationVersion(catalog?.version ?? "");
                  setCursor(matches.cursor);
                }}
              >
                Meer onderwerpen →
              </button>
            )}
          </div>
          {!matches.topics.length && (
            <p className="empty-state">
              Geen onderwerpen op deze pagina.{" "}
              {matches.more
                ? "Bekijk meer resultaten of maak je zoekopdracht specifieker."
                : "Probeer een korter woord of een ander onderwerp."}
            </p>
          )}
        </>
      )}
      {selected && (
        <div className="chosen-topic">
          <div>
            <span className="eyebrow">JOUW ONDERWERP</span>
            <h3>{selected.title}</h3>
            <p className="topic-path">
              {selected.path
                .slice(0, -1)
                .map((p) => p.title)
                .join(" / ")}
            </p>
            <span className="group-tag">
              {selected.group.title}
              <b title={selected.group.routeTitle}>
                {selected.group.routeCode}
              </b>
            </span>
          </div>
          <div className="chosen-topic-actions">
            <button
              className="text-button"
              onClick={() => setShowGoals(!showGoals)}
            >
              {showGoals
                ? "Verberg leerdoelen"
                : selected.goalCount === 1
                  ? "Bekijk het leerdoel"
                  : `Bekijk alle ${selected.goalCount} leerdoelen`}
            </button>
            <button
              className="text-button"
              onClick={() => {
                setSelection({ catalogVersion: "", goalSetKey: "" });
                setShowGoals(false);
              }}
            >
              Wis selectie
            </button>
          </div>
        </div>
      )}
      {selected && showGoals && (
        <div className="goal-section">
          <p className="goal-preview-note">
            Hier zie je de volledige doelenlijst die Krito zal controleren. Je
            hoeft geen doelen afzonderlijk te kiezen.
          </p>
          {!list && <p className="empty-state">Leerdoelen laden…</p>}
          <div className="goal-list">
            {list?.goals.map((goal) => (
              <GoalPreview key={goal.goalId} goal={goal} />
            ))}
          </div>
          {list && (
            <div className="page-controls">
              {goalOffset > 0 && (
                <button
                  onClick={() => setGoalOffset(Math.max(0, goalOffset - 50))}
                >
                  ← Vorige doelen
                </button>
              )}
              {list.more && (
                <button onClick={() => setGoalOffset(goalOffset + 50)}>
                  Volgende doelen →
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div className="selection-summary">
        <div>
          <strong>
            {selected
              ? selected.goalCount === 1
                ? "Het leerdoel wordt gecontroleerd"
                : `Alle ${selected.goalCount} leerdoelen worden gecontroleerd`
              : "Kies een onderwerp om te starten"}
          </strong>
          <p>
            {selected
              ? `${selected.title} · ${selected.group.title} · ${selected.group.routeTitle}`
              : "Je kiest een subdomein en groep; Krito neemt de volledige doelenlijst mee."}
          </p>
        </div>
        <span className="next-step-label">
          Daarna: voeg je lesmateriaal toe <span aria-hidden="true">→</span>
        </span>
      </div>
      {catalog && (
        <p className="catalog-source">
          <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">
            Officiële Op.stap-bron ↗
          </a>
          <span>
            Versie {catalog.version} · {catalog.sourceDate}
          </span>
        </p>
      )}
    </section>
  );
}
