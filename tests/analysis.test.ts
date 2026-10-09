import { describe, expect, it } from "vitest";
import {
  validateAnalysis,
  recheckGoalIds,
  mergeResults,
  isCurrentRun,
} from "../shared/validateAnalysis";
import type { GoalResult } from "../shared/analysisSchema";
const manifest = [
  { fileId: "pdf-one", name: "les.pdf", pageCount: 2, bytes: 200 },
];
function row(goalId = "goal-a", confidence = 88): GoalResult {
  return {
    goalId,
    status: "covered",
    confidence,
    confidenceReason: "Duidelijk bewijs.",
    explanation: "Alle onderdelen zijn ondersteund.",
    evidence: [
      {
        fileId: "pdf-one",
        page: 2,
        kind: "text",
        quote: "Breuken vergelijken",
        description: "Oefening",
      },
    ],
    missingRequirements: [],
  };
}
describe("structured analysis validation", () => {
  it("requires exactly the complete selected goal set and preserves source order", () => {
    expect(
      validateAnalysis(
        { results: [row("b"), row("a")] },
        ["a", "b"],
        manifest,
      ).results.map((r) => r.goalId),
    ).toEqual(["a", "b"]);
    for (const results of [
      [row("extra")],
      [],
      [row(), row()],
      [row(), row("extra")],
    ])
      expect(() =>
        validateAnalysis({ results }, ["goal-a"], manifest),
      ).toThrow();
  });
  it("rejects invented files and pages, fractional confidence, and non-schema data", () => {
    const valid = row();
    for (const invalid of [
      { ...valid, confidence: 100.1 },
      { ...valid, confidence: -1 },
      { ...valid, confidence: 59.5 },
      { ...valid, extra: "ignored?" },
      { ...valid, evidence: [{ ...valid.evidence[0], fileId: "foreign" }] },
      { ...valid, evidence: [{ ...valid.evidence[0], page: 0 }] },
      { ...valid, evidence: [{ ...valid.evidence[0], page: 3 }] },
    ])
      expect(() =>
        validateAnalysis({ results: [invalid] }, [valid.goalId], manifest),
      ).toThrow();
  });
  it("requires evidence for coverage, exact text quotes and useful visual descriptions", () => {
    const valid = row();
    for (const invalid of [
      { ...valid, evidence: [] },
      { ...valid, missingRequirements: ["Onderdeel ontbreekt"] },
      { ...valid, evidence: [{ ...valid.evidence[0], quote: " " }] },
      {
        ...valid,
        evidence: [
          {
            ...valid.evidence[0],
            kind: "visual",
            quote: null,
            description: " ",
          },
        ],
      },
    ])
      expect(() =>
        validateAnalysis({ results: [invalid] }, [valid.goalId], manifest),
      ).toThrow();
    expect(
      validateAnalysis(
        {
          results: [
            {
              ...valid,
              evidence: [
                {
                  ...valid.evidence[0],
                  kind: "visual",
                  quote: null,
                  description: "Een cirkel verdeeld in vier gelijke stukken.",
                },
              ],
            },
          ],
        },
        [valid.goalId],
        manifest,
      ).results,
    ).toHaveLength(1);
  });
  it("checks partial and not-found consistency without confusing verdict and confidence", () => {
    const valid = row();
    expect(() =>
      validateAnalysis(
        { results: [{ ...valid, status: "partial" }] },
        [valid.goalId],
        manifest,
      ),
    ).toThrow();
    expect(() =>
      validateAnalysis(
        { results: [{ ...valid, status: "not_found" }] },
        [valid.goalId],
        manifest,
      ),
    ).toThrow();
    expect(
      validateAnalysis(
        {
          results: [
            { ...valid, status: "not_found", confidence: 95, evidence: [] },
          ],
        },
        [valid.goalId],
        manifest,
      ).results[0].confidence,
    ).toBe(95);
  });
});
it("escalates only confidence below 60 and replaces an entire result without averaging", () => {
  const initial = [row("a", 88), row("b", 59), row("c", 60), row("d", 35)];
  expect(recheckGoalIds(initial)).toEqual(["b", "d"]);
  const replacement: GoalResult = {
    ...row("b", 91),
    status: "not_found",
    evidence: [],
    missingRequirements: ["Geen ondersteuning"],
  };
  const merged = mergeResults(initial, new Map([["b", replacement]]));
  expect(merged.map((r) => r.goalId)).toEqual(["a", "b", "c", "d"]);
  expect(merged[1]).toEqual(replacement);
  expect(merged[0]).toBe(initial[0]);
  expect(merged[3]).toBe(initial[3]);
  expect(() =>
    validateAnalysis({ results: [replacement, row("d")] }, ["b"], manifest),
  ).toThrow();
});
it("ignores late writes from old attempts, generations and terminal runs", () => {
  const run = { attempt: 2, generation: 3, status: "polling" };
  expect(isCurrentRun(2, run, 2, 3)).toBe(true);
  expect(isCurrentRun(3, run, 2, 3)).toBe(false);
  expect(isCurrentRun(2, run, 2, 2)).toBe(false);
  for (const status of ["completed", "failed", "interrupted"])
    expect(isCurrentRun(2, { ...run, status }, 2, 3)).toBe(false);
});
