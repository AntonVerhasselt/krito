import type { ReportModel } from "../report/model";
import type { Link, Variables } from "./template";

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * A link that shows its plain address but tells PostHog which e-mail it came
 * from (`via`); EmailLinkTracker strips `via` again on arrival.
 */
export function trackedLink(url: string, via: string): Link {
  const href = new URL(url);
  href.searchParams.set("via", via);
  return { text: url, href: href.toString() };
}

/** Readable in plain text: the key's ":" is a valid query character and stays unescaped. */
export function materialUrl(siteUrl: string, goalSet: { catalogVersion: string; key: string }) {
  const params = [`onderwerp=${encodeURIComponent(goalSet.key).replaceAll("%3A", ":")}`, `versie=${encodeURIComponent(goalSet.catalogVersion)}`];
  return `${new URL("/materiaal", siteUrl)}?${params.join("&")}`;
}

export function reportVariables(model: ReportModel): Variables {
  return {
    topic: model.title,
    group: model.group,
    date: model.date,
    files: plural(model.files.length, "bestand", "bestanden"),
    goals: plural(model.goalCount, "leerdoel", "leerdoelen"),
    covered: model.counts.covered,
    partial: model.counts.partial,
    notFound: model.counts.not_found,
    uncertain: model.counts.uncertain,
    reviewGoals: model.review ? plural(model.review, "doel", "doelen") : "",
    skippedFiles: model.skippedFiles.join(", "),
  };
}
