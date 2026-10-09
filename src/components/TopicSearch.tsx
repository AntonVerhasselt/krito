"use client";
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { StatusIcon } from "./SiteHeader";
export type Topic = FunctionReturnType<
  typeof api.goals.listGoalSets
>["topics"][number];
const suggestions = ["breuken", "magnetisme", "sociale aandacht"];
function highlight(text: string, query: string): ReactNode {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return text;
  return text
    .split(new RegExp(`(${words.join("|")})`, "gi"))
    .map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}
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
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<string | null>(null);
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
  useEffect(() => {
    document.documentElement.classList.toggle("search-open", open);
    // Give the dropdown room on desktop; on small screens it goes fullscreen.
    const box = input.current?.parentElement?.getBoundingClientRect();
    if (open && box && innerWidth > 860) {
      const lack = box.bottom + 470 - innerHeight;
      if (lack > 0)
        scrollBy({
          top: Math.min(lack, box.top - 24),
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
    }
    return () => document.documentElement.classList.remove("search-open");
  }, [open]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        e.key === "/" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !target?.closest("input, textarea, [contenteditable]")
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  function choose(topic: Topic) {
    if (chosen) return;
    setChosen(topic.key);
    // Let the chalk tick land before the board changes.
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 420;
    setTimeout(() => {
      onSelect(topic);
      setOpen(false);
      setActive(-1);
      setChosen(null);
    }, delay);
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
      className={`topic-combobox${open ? " is-open" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <label htmlFor={`${id}-input`} className="visually-hidden">
        Onderwerp
      </label>
      <div className="search-box">
        <button
          type="button"
          className="search-back"
          aria-label="Sluit zoeken"
          onClick={() => setOpen(false)}
        >
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24">
            <path
              d="M15 5 8 12l7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <svg
          className="search-glass"
          aria-hidden="true"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.6" />
          <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
        <input
          ref={input}
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
          spellCheck={false}
          placeholder="Zoek een onderwerp, bv. breuken"
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
            } else if (e.key === "Enter" && open && topics.length) {
              e.preventDefault();
              choose(topics[Math.max(active, 0)]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
            }
          }}
        />
        {!open && !query && !selected && (
          <kbd className="search-shortcut" aria-hidden="true">
            /
          </kbd>
        )}
      </div>
      {open && (
        <div className="search-dropdown">
          {!query && (
            <div className="search-suggestions">
              <span>Probeer</span>
              {suggestions.map((s) => (
                <button
                  type="button"
                  key={s}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    search(s);
                    input.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div
            id={`${id}-results`}
            role="listbox"
            aria-label="Onderwerpen"
            className="search-options"
          >
            {!result && (
              <p className="dropdown-message" role="status">
                <StatusIcon status="loading" size={22} /> Onderwerpen zoeken…
              </p>
            )}
            {topics.map((topic, index) => (
              <button
                type="button"
                role="option"
                aria-selected={selected?.key === topic.key}
                id={`${id}-option-${index}`}
                key={topic.key}
                style={{ "--i": index } as CSSProperties}
                className={`search-option${active === index ? " keyboard-active" : ""}${chosen === topic.key ? " is-chosen" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(topic)}
              >
                <span className="option-tick" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/mark.svg" alt="" width={30} height={24} />
                </span>
                <span className="search-option-body">
                  <span className="search-option-title">
                    {highlight(topic.title, debounced)}
                  </span>
                  <span className="search-option-context">
                    {topic.path
                      .slice(0, -1)
                      .map((p) => p.title)
                      .join(" / ")}
                  </span>
                </span>
                <span className="search-option-meta">
                  <span className="group-tag">
                    {topic.group.title}
                    <b title={topic.group.routeTitle}>
                      {topic.group.routeCode}
                    </b>
                  </span>
                  <span className="goal-count">
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
                  Vorige
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
                  Meer resultaten
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
