"use client";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { saveSession, type AnalysisSession } from "./analysisSession";

type Status = { status: string } | null | undefined;
export type TopicChoice = { catalogVersion: string; key: string };

/**
 * Switches the selected topic the same way everywhere (search, e-mail link): a
 * draft keeps its uploaded files under the new topic, a started analysis is
 * left as it is. Errors propagate and leave session and selection untouched.
 */
export async function chooseTopic(
  convex: ConvexReactClient,
  session: AnalysisSession | null,
  live: Status,
  topic: TopicChoice,
  setSelection: (next: { catalogVersion: string; goalSetKey: string }) => void,
) {
  // The caller's status may not have loaded yet; fetch it once so a draft keeps its files.
  const status = session && live === undefined ? await convex.query(api.analyses.getStatus, session) : live;
  const keptDraft = !!session && status?.status === "draft";
  if (session && keptDraft)
    await convex.mutation(api.analyses.updateTopic, {
      ...session,
      catalogVersion: topic.catalogVersion,
      goalSetKey: topic.key,
    });
  else if (session) saveSession(null);
  setSelection({ catalogVersion: topic.catalogVersion, goalSetKey: topic.key });
  return { keptDraft };
}
