import type { ReportInput } from "../../shared/report/model";
import { demoFiles, demoGoals, demoTopic } from "../../src/lib/demoAnalysis";

const pages: Record<string, number> = { les: 14, oef: 6, toets: 2 };
const sizes: Record<string, number> = { les: 2_400_000, oef: 310_000, toets: 96_000 };
const stripTags = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

/** The homepage demo (Magnetisme, 3de leerjaar) as report input. */
export function demoReportInput(): ReportInput {
  return {
    topic: demoTopic,
    files: demoFiles.map((f) => ({ ...f, pageCount: pages[f.fileId], bytes: sizes[f.fileId] })),
    goals: demoGoals.map((g) => ({
      snapshot: {
        goalId: g.goalId,
        wordingText: stripTags(g.wording),
        sourceUrl: g.sourceUrl ?? "https://pro.katholiekonderwijs.vlaanderen/opstap",
      },
      result: g.result!,
      rechecked: g.modelUsed === "gpt-6.1-sol",
      needsReview: !!g.needsReview,
      reviewReason: g.reviewReason ?? null,
    })),
    completedAt: Date.UTC(2026, 9, 12, 14, 30),
  };
}

/** The largest Op.stap topic has 268 goals; quotes include symbols the fonts may lack. */
export function largeReportInput(count = 268): ReportInput {
  const base = demoReportInput();
  const verdicts = ["covered", "partial", "not_found", "uncertain"] as const;
  return {
    ...base,
    topic: { ...base.topic, title: "Een onderwerp met heel veel leerdoelen", goalCount: count },
    goals: Array.from({ length: count }, (_, i) => {
      const status = verdicts[i % 4];
      return {
        snapshot: {
          goalId: `9.9.GL${i + 1}`,
          wordingText: `De leerlingen passen strategie ${i + 1} toe bij het oplossen van vraagstukken met breuken ≤ ½ en pijlen →, ook in nieuwe contexten.`,
          sourceUrl: `https://pro.katholiekonderwijs.vlaanderen/opstap/doel-${i + 1}`,
        },
        result: {
          status,
          confidence: 40 + (i % 60),
          confidenceReason: "Het materiaal behandelt het doel expliciet in een oefening.",
          explanation: "De oefenbundel vraagt leerlingen om de strategie stap voor stap toe te passen 😀.",
          evidence: status === "not_found" ? [] : [
            { fileId: "oef", page: 1 + (i % 6), kind: "text" as const, quote: "Kleur ½ van de taart en schrijf ≤ of ≥.", description: "Oefening met breuken." },
          ],
          missingRequirements: status === "covered" ? [] : ["Een toepassing in een nieuwe context."],
        },
        rechecked: status === "uncertain",
        needsReview: status === "uncertain",
        reviewReason: status === "uncertain" ? "low_confidence" : null,
      };
    }),
  };
}
