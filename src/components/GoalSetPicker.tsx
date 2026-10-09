"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useTopicSelection } from "../lib/useTopicSelection";
import { TopicSearch } from "./TopicSearch";
import { GoalPreview } from "./GoalPreview";
export function GoalSetPicker() {
  const catalog = useQuery(api.goals.catalogInfo);
  const [selection, setSelection] = useTopicSelection();
  const [showGoals, setShowGoals] = useState(false);
  const [offset, setOffset] = useState(0);
  const selected = useQuery(
    api.goals.getGoalSet,
    selection.goalSetKey
      ? { catalogVersion: selection.catalogVersion, key: selection.goalSetKey }
      : "skip",
  );
  const goals = useQuery(
    api.goals.listGoals,
    selected && showGoals
      ? {
          catalogVersion: selected.catalogVersion,
          goalSetKey: selected.key,
          offset,
        }
      : "skip",
  );
  return (
    <section className="analysis-panel" aria-labelledby="analysis-title">
      <div className="panel-heading">
        <span className="eyebrow">JOUW LESMATERIAAL, HELDER IN BEELD</span>
        <h2 id="analysis-title">Start je analyse</h2>
        <p>Een onderwerp, je pdf’s en inzicht per leerdoel.</p>
      </div>
      <div className="wizard-steps" aria-label="Stappen">
        <span className="active">
          <b>1</b> Onderwerp
        </span>
        <span>
          <b>2</b> Materiaal
        </span>
        <span>
          <b>3</b> Analyse
        </span>
      </div>
      {catalog ? (
        <TopicSearch
          selected={selected}
          catalogVersion={catalog.version}
          onSelect={(topic) => {
            setSelection({
              catalogVersion: topic.catalogVersion,
              goalSetKey: topic.key,
            });
            setShowGoals(false);
            setOffset(0);
          }}
        />
      ) : (
        <p className="dropdown-message">Catalogus laden…</p>
      )}
      {selected ? (
        <div className="scope-note">
          <span className="group-tag">
            {selected.group.title}
            <b title={selected.group.routeTitle}>{selected.group.routeCode}</b>
          </span>
          <p>
            {selected.goalCount === 1
              ? "Het bijbehorende leerdoel wordt gecontroleerd."
              : `Alle ${selected.goalCount} bijbehorende leerdoelen worden gecontroleerd.`}
          </p>
          <button
            type="button"
            className="text-button"
            onClick={() => setShowGoals(true)}
          >
            Bekijk de doelen
          </button>
        </div>
      ) : (
        <p className="field-hint">
          Zoek op onderwerp, leergebied of groep. Alle bijbehorende doelen
          worden meegenomen.
        </p>
      )}
      <div className="hero-next-step">
        <span className="field-label">Lesmateriaal</span>
        <p className="field-hint">
          Daarna voeg je je pdf’s toe om de gekozen doelen te controleren.
        </p>
      </div>
      <div className="panel-footer">
        <span className="privacy-mark">
          ⌁ Privé documenten · jouw oordeel blijft centraal
        </span>
        {catalog && (
          <a href={catalog.sourceUrl} target="_blank" rel="noreferrer">
            Op.stap v{catalog.version} ↗
          </a>
        )}
      </div>
      {selected && showGoals && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowGoals(false);
          }}
        >
          <div
            className="goal-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Leerdoelen in je analyse"
          >
            <div className="modal-heading">
              <div>
                <h3>{selected.title}</h3>
                <p>
                  {selected.group.title} · {selected.goalCount} leerdoelen
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="Sluit leerdoelen"
                onClick={() => setShowGoals(false)}
              >
                ×
              </button>
            </div>
            <p className="field-hint">
              Dit is de volledige doelenlijst voor je analyse.
            </p>
            <div className="goal-list">
              {goals?.goals.map((goal) => (
                <GoalPreview key={goal.goalId} goal={goal} />
              ))}
            </div>
            <div className="page-controls">
              {offset > 0 && (
                <button onClick={() => setOffset(Math.max(0, offset - 50))}>
                  ← Vorige doelen
                </button>
              )}
              {goals?.more && (
                <button onClick={() => setOffset(offset + 50)}>
                  Volgende doelen →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
