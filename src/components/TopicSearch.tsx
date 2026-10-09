"use client";
import { useEffect, useId, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
export type Topic = FunctionReturnType<
  typeof api.goals.listGoalSets
>["topics"][number];
export function TopicSearch({
  selected,
  catalogVersion,
  onSelect,
  disabled = false,
}: {
  selected: Topic | null | undefined;
  catalogVersion: string;
  onSelect: (topic: Topic) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useQuery(
    api.goals.listGoalSets,
    open ? { search: debounced, catalogVersion, cursor } : "skip",
  );
  const topics = result?.topics ?? [];
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function choose(topic: Topic) {
    onSelect(topic);
    setOpen(false);
    setActive(-1);
  }
  function search(value: string) {
    setQuery(value);
    setCursor(null);
    setPrevious([]);
    setActive(-1);
    setOpen(true);
  }
  return (
    <div
      className="topic-combobox"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={`${id}-input`} className="field-label">
        Onderwerp
      </label>
      <div className={`search-box${open ? " expanded" : ""}`}>
        <svg
          aria-hidden="true"
          width="20"
          height="20"
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
          id={`${id}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={
            open && active >= 0 && topics[active]
              ? `${id}-option-${active}`
              : undefined
          }
          aria-label="Zoek onderwerpen"
          autoComplete="off"
          placeholder="Zoek een onderwerp of leerjaar…"
          disabled={disabled}
          value={open ? query : (selected?.title ?? query)}
          onFocus={(e) => {
            setOpen(true);
            e.currentTarget.select();
          }}
          onClick={(e) => {
            if (!open) e.currentTarget.select();
            setOpen(true);
          }}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              if (topics.length)
                setActive(
                  e.key === "ArrowDown"
                    ? (active + 1) % topics.length
                    : (active - 1 + topics.length) % topics.length,
                );
            } else if (
              e.key === "Enter" &&
              open &&
              active >= 0 &&
              topics[active]
            ) {
              e.preventDefault();
              choose(topics[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="combobox-toggle"
          aria-label={open ? "Sluit zoekresultaten" : "Open zoekresultaten"}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
          >
            <path
              d={open ? "m5 12 5-5 5 5" : "m5 8 5 5 5-5"}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>
      </div>
      {open && (
        <div className="search-dropdown">
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Onderwerpen"
            className="search-options"
          >
            {!result && (
              <p className="dropdown-message" role="status">
                Onderwerpen zoeken…
              </p>
            )}
            {topics.map((topic, index) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.key === topic.key}
                id={`${id}-option-${index}`}
                key={topic.key}
                className={`search-option${active === index ? " keyboard-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(topic)}
              >
                <span className="search-option-title">{topic.title}</span>
                <span className="search-option-context">
                  {topic.path
                    .slice(0, -1)
                    .map((p) => p.title)
                    .join(" / ")}
                </span>
                <span className="search-option-meta">
                  <span className="group-tag">
                    {topic.group.title}
                    <b title={topic.group.routeTitle}>
                      {topic.group.routeCode}
                    </b>
                  </span>
                  <span>
                    {topic.goalCount}{" "}
                    {topic.goalCount === 1 ? "doel" : "doelen"}
                  </span>
                </span>
              </button>
            ))}
            {result && !topics.length && (
              <p className="dropdown-message">
                Geen passende onderwerpen. Probeer bijvoorbeeld “breuken” of
                “sociale aandacht”.
              </p>
            )}
          </div>
          {result && (result.more || previous.length > 0) && (
            <div className="dropdown-pages">
              {previous.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCursor(previous.at(-1) ?? null);
                    setPrevious(previous.slice(0, -1));
                    setActive(-1);
                  }}
                >
                  ← Vorige
                </button>
              )}
              {result.more && (
                <button
                  type="button"
                  onClick={() => {
                    setPrevious([...previous, cursor]);
                    setCursor(result.cursor);
                    setActive(-1);
                  }}
                >
                  Meer resultaten →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
