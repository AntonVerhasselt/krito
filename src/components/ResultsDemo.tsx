"use client";
import { GoalList } from "./GoalList";
import { demoFiles, demoGoals } from "../lib/demoAnalysis";

/** A static sample of the results list, for the homepage. */
export function ResultsDemo({ ids }: { ids?: string[] }) {
  const goals = ids
    ? demoGoals.filter((g) => ids.includes(g.goalId))
    : demoGoals.filter((g) => !["3.5.GL3.15", "3.5.GL3.17"].includes(g.goalId));
  return (
    <div className="results-demo">
      <GoalList goals={goals} phase="completed" files={demoFiles} analytics={{ is_demo: true, surface: "homepage_example" }} />
    </div>
  );
}
