"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { track, captureAnalyticsError } from "../lib/analytics";
import { StatusIcon } from "./brand";
import { OptionMark } from "./brand";
export type Topic = FunctionReturnType<
  typeof api.goals.listGoalSets
>["topics"][number];
const suggestions = ["breuken", "magnetisme", "sociale aandacht"];
// Show a few results at a time instead of a scrolling list.
const STEP = 5;
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
  /** Optional: without it the search uses the published catalog. */
  catalogVersion?: string;
  onSelect: (topic: Topic) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const convex = useConvex();
  const choosing = useRef(false);
  const interactionOpen = useRef(false);
  const typingStarted = useRef(false);
  const latestResults = useRef("");
  const openingMethod = useRef("focus");
  const queryStartedAt = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<string | null>(null);
  const [visible, setVisible] = useState(STEP);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useQuery(
    api.goals.listGoalSets,
    open ? { search: debounced, catalogVersion, cursor } : "skip",
  );
  useEffect(() => {
    if (!open || !query.trim()) return;
    const timer = setTimeout(() => track("search_query_updated", {
      query_length: query.length, word_count: query.trim().split(/\s+/).length,
    }), 600);
    return () => clearTimeout(timer);
  }, [query, open]);
  useEffect(() => {
    if (!open || !result || debounced !== query) return;
    const key = JSON.stringify([debounced, cursor]);
    if (latestResults.current === key) return;
    latestResults.current = key;
    const props = { query_length: debounced.length, result_count: result.topics.length,
      visible_count: Math.min(result.topics.length, STEP), has_more: result.more,
      page: previous.length, duration_ms: queryStartedAt.current ? Date.now() - queryStartedAt.current : 0 };
    track("search_results_loaded", props);
    if (debounced.trim() && !result.topics.length) track("search_no_results", props);
  }, [result, open, debounced, query, cursor, previous.length]);
  function openSearch(method: string) {
    if (!interactionOpen.current) {
      interactionOpen.current = true;
      typingStarted.current = false;
      latestResults.current = "";
      track("search_opened", { interaction_method: method });
    }
    setOpen(true);
  }
  function closeSearch(reason: string, selected = false) {
    if (interactionOpen.current) track("search_closed", { reason, selected, had_input: typingStarted.current });
    interactionOpen.current = false;
    setOpen(false);
  }
  const topics = result?.topics ?? [];
  const shown = topics.slice(0, visible);
  useEffect(() => {
    if (open && active >= 0)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  useEffect(() => {
    document.documentElement.classList.toggle("search-open", open);
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
        openingMethod.current = "shortcut";
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  /** Enter before the results for the typed text arrived: fetch them now. */
  async function chooseFirstFor(text: string) {
    try {
      const fresh = await convex.query(api.goals.listGoalSets, {
        search: text,
        catalogVersion,
        cursor: null,
      });
      if (fresh.topics[0]) choose(fresh.topics[0], "keyboard");
    } catch (error) {
      captureAnalyticsError(error, "search_results");
      // The list stays open; the teacher can pick a result once it loads.
    }
  }
  function choose(topic: Topic, method = "pointer") {
    // A ref, not state: Enter can resolve after an await in an older render.
    if (choosing.current) return;
    choosing.current = true;
    track("subject_selection_requested", { subject_key: topic.key, group_key: topic.group.sourceKey,
      catalog_version: topic.catalogVersion, goal_count: topic.goalCount,
      interaction_method: method, position: topics.findIndex((t) => t.key === topic.key) + 1 });
    setChosen(topic.key);
    // Let the pen tick land before the page changes.
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 420;
    setTimeout(() => {
      onSelect(topic);
      closeSearch("selected", true);
      setActive(-1);
      setChosen(null);
      choosing.current = false;
    }, delay);
  }
  function search(value: string, typed = true) {
    openSearch("typing");
    if (typed && value.trim() && !typingStarted.current) {
      typingStarted.current = true;
      track("search_typing_started");
    }
    queryStartedAt.current = Date.now();
    setQuery(value);
    setCursor(null);
    setPrevious([]);
    setVisible(STEP);
    setActive(-1);
  }
  return (
    <div
      className={`topic-combobox${open ? " is-open" : ""}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          closeSearch("blur");
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
          onClick={() => closeSearch("back")}
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
          <circle
            cx="10.5"
            cy="10.5"
            r="6.5"
            stroke="currentColor"
            strokeWidth="2.6"
          />
          <path
            d="m15.5 15.5 5 5"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
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
          value={query}
          onPointerDown={() => { openingMethod.current = "pointer"; }}
          onFocus={(e) => {
            openSearch(openingMethod.current);
            openingMethod.current = "focus";
            e.currentTarget.select();
          }}
          onClick={(e) => {
            track("search_clicked");
            if (!open) e.currentTarget.select();
            openSearch("pointer");
          }}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              openSearch("keyboard");
              if (topics.length) {
                const next =
                  e.key === "ArrowDown"
                    ? (active + 1) % topics.length
                    : (active - 1 + topics.length) % topics.length;
                if (next >= visible) setVisible(next + 1);
                setActive(next);
              }
            } else if (e.key === "Enter" && open && (topics.length || query)) {
              e.preventDefault();
              // Without a highlighted option, Enter takes the first result
              // for what was typed, fetching it if the list is still loading.
              if (active >= 0 && topics[active]) choose(topics[active], "keyboard");
              else if (debounced === query && result) {
                if (topics[0]) choose(topics[0], "keyboard");
              } else void chooseFirstFor(query);
            } else if (e.key === "Escape") {
              e.preventDefault();
              closeSearch("escape");
            }
          }}
        />
        {!open && !query && (
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
                    track("search_suggestion_clicked", { suggestion: s });
                    search(s, false);
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
            {shown.map((topic, index) => (
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
                  <OptionMark />
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
          {topics.length > visible && (
            <button
              type="button"
              className="show-more"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { track("search_more_topics_clicked", { visible_count: visible, result_count: topics.length }); setVisible(visible + STEP); }}
            >
              Toon meer onderwerpen
              <span>{topics.length - visible}</span>
            </button>
          )}
          {result &&
            topics.length <= visible &&
            (result.more || previous.length > 0) && (
              <div className="dropdown-pages">
                {previous.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      track("search_page_changed", { direction: "previous", page: previous.length - 1 });
                      setCursor(previous.at(-1) ?? null);
                      setPrevious(previous.slice(0, -1));
                      setVisible(STEP);
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
                      track("search_page_changed", { direction: "next", page: previous.length + 1 });
                      setPrevious([...previous, cursor]);
                      setCursor(result.cursor);
                      setVisible(STEP);
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
