import { SourceMarkup } from "./SourceMarkup";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
export type GoalResult = FunctionReturnType<
  typeof api.goals.listGoals
>["goals"][number];
export function GoalPreview({ goal }: { goal: GoalResult }) {
  return (
    <article className="goal-card">
      <span className="goal-code">{goal.goalId}</span>
      <div className="goal-wording">
        <SourceMarkup html={goal.wording} />
      </div>
      {goal.cluster && <p className="breadcrumb">{goal.cluster.title}</p>}
      {goal.clarification && (
        <details>
          <summary>Officiële toelichting</summary>
          <div className="source-clarification">
            <SourceMarkup html={goal.clarification} />
          </div>
        </details>
      )}
    </article>
  );
}
