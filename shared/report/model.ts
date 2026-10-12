import { skipReason } from "../skipReasons";

/**
 * The pdf report as plain data: everything the document shows, already
 * counted, labelled and sorted. Rendering only lays this out.
 */
export type Verdict = "covered" | "partial" | "not_found" | "uncertain";

export const VERDICTS: Verdict[] = ["covered", "partial", "not_found", "uncertain"];
export const verdictLabels: Record<Verdict, string> = {
  covered: "Gedekt",
  partial: "Gedeeltelijk gedekt",
  not_found: "Niet gevonden",
  uncertain: "Onzeker",
};

export type ReportInput = {
  topic: {
    title: string;
    path: { title: string }[];
    group: { title: string; routeCode: string; routeTitle: string };
    goalCount: number;
    catalogVersion: string;
  };
  files: { fileId: string; name: string; pageCount: number; bytes: number }[];
  /** Submitted files Krito couldn't read; the report doesn't cover them. */
  skippedFiles?: { name: string; safeError: string | null }[];
  goals: {
    snapshot: { goalId: string; wordingText: string; sourceUrl: string };
    result: {
      status: Verdict;
      confidence: number;
      confidenceReason: string;
      explanation: string;
      evidence: {
        fileId: string;
        page: number;
        kind: "text" | "visual";
        quote: string | null;
        description: string;
      }[];
      missingRequirements: string[];
    };
    rechecked: boolean;
    needsReview: boolean;
    reviewReason: string | null;
  }[];
  completedAt: number;
};

export type ReportGoal = {
  code: string;
  wording: string;
  verdict: Verdict;
  label: string;
  confidence: number;
  confidenceReason: string;
  explanation: string;
  missing: string[];
  evidence: { file: string; page: number; quote: string | null; description: string }[];
  reviewNote: string | null;
  rechecked: boolean;
  sourceUrl: string;
};

export type ReportModel = {
  title: string;
  context: string;
  group: string;
  routeCode: string;
  catalogVersion: string;
  date: string;
  /** When the analysis completed; also the pdf's creation date. */
  timestamp: number;
  fileName: string;
  goalCount: number;
  counts: Record<Verdict, number>;
  review: number;
  files: { name: string; pages: number; size: string }[];
  skippedFiles: { name: string; reason: string }[];
  goals: ReportGoal[];
};

const brussels = new Intl.DateTimeFormat("nl-BE", {
  timeZone: "Europe/Brussels",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** dd-mm-jjjj in Brussels time, the way Flemish teachers write dates. */
export function reportDate(timestamp: number) {
  return brussels.format(new Date(timestamp)).replaceAll("/", "-");
}

export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Krito - Magnetisme 3de leerjaar - 2026-10-12.pdf, without characters file systems refuse. */
export function reportFileName(title: string, group: string, timestamp: number) {
  const [day, month, year] = reportDate(timestamp).split("-");
  const safe = `${title} ${group}`.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return `Krito - ${safe.slice(0, 120)} - ${year}-${month}-${day}.pdf`;
}

/**
 * Text as the pdf fonts can draw it: no font has the non-breaking hyphen that
 * one Op.stap goal uses, and control characters would print as boxes.
 */
export function printable(text: string) {
  return text.replace(/\u2011/g, "-").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export function buildReportModel(input: ReportInput): ReportModel {
  const names = new Map(input.files.map((f) => [f.fileId, f.name]));
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  for (const g of input.goals) counts[g.result.status]++;
  const { topic } = input;
  return {
    title: topic.title,
    context: topic.path.slice(0, -1).map((p) => p.title).join(" / "),
    group: topic.group.title,
    routeCode: topic.group.routeCode,
    catalogVersion: topic.catalogVersion,
    date: reportDate(input.completedAt),
    timestamp: input.completedAt,
    fileName: reportFileName(topic.title, topic.group.title, input.completedAt),
    goalCount: input.goals.length,
    counts,
    review: input.goals.filter((g) => g.needsReview).length,
    files: input.files.map((f) => ({ name: printable(f.name), pages: f.pageCount, size: fileSize(f.bytes) })),
    skippedFiles: (input.skippedFiles ?? []).map((f) => ({ name: printable(f.name), reason: skipReason(f.safeError) })),
    goals: input.goals.map(({ snapshot, result, needsReview, reviewReason, rechecked }) => ({
      code: snapshot.goalId,
      wording: printable(snapshot.wordingText),
      verdict: result.status,
      label: verdictLabels[result.status],
      confidence: result.confidence,
      confidenceReason: printable(result.confidenceReason),
      explanation: printable(result.explanation),
      missing: result.missingRequirements.map(printable),
      evidence: result.evidence.map((e) => ({
        file: printable(names.get(e.fileId) ?? "Onbekend bestand"),
        page: e.page,
        quote: e.kind === "text" && e.quote ? printable(e.quote) : null,
        description: printable(e.description),
      })),
      // The same wording as the results page.
      reviewNote: !needsReview ? null : reviewReason === "recheck_failed"
        ? "De tweede controle is mislukt. De oorspronkelijke beoordeling blijft bewaard; kijk dit doel zelf na."
        : "Ook na de tweede controle blijft de beoordeling onzeker. Kijk dit doel zelf na.",
      rechecked,
      sourceUrl: snapshot.sourceUrl,
    })),
  };
}
