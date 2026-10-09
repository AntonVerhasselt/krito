import { normalizeSearch } from "./catalogSearch";
import { z } from "zod";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";

export const SOURCE_URL = "https://opstap.katholiekonderwijs.vlaanderen/";
export const SNAPSHOTS_URL =
  "https://cached-api.katholiekonderwijs.vlaanderen/documents/bdc19260-bd4c-46a8-8009-b2a54f381120/snapshots";
export const ROUTES = ["P", "G", "Z", "S", "+", "A", "V"] as const;
export const routeSchema = z.enum(ROUTES);
const refSchema = z.object({ href: z.string().min(1), title: z.string() });
export const itemSchema = z
  .object({
    key: z.uuid(),
    href: z.string().min(1),
    type: z.enum([
      "KRC_CURRICULUM",
      "KRC_DISCIPLINE_CONTAINER",
      "KRC_CURRICULUM_DISCIPLINE",
      "KRC_CURRICULUM_DOMAIN",
      "KRC_CURRICULUM_SUBDOMAIN",
      "KRC_CURRICULUM_CLUSTER",
      "KRC_GOAL_SET_ITEM",
      "KRC_AGE_RANGE_ITEM",
      "KRC_CURRICULUM_GOAL",
      "KRC_REFERENCE_FRAME",
      "KRC_GOAL_SET",
      "KRC_AGE_RANGE",
    ]),
    title: z.string().optional(),
    description: z.string().optional(),
    identifier: z.string().optional(),
    parentHref: z.string().optional(),
    childrenHrefs: z.array(z.string()).optional(),
    themes: z.array(z.string()).optional(),
    startDate: z.string(),
    orderInDocument: z.number().int().nonnegative(),
    discipline: refSchema.optional(),
    domain: refSchema.optional(),
    subdomain: refSchema.optional(),
    ageRange: refSchema.optional(),
    coherences: z
      .partialRecord(
        z.enum([
          "together",
          "alternative",
          "after",
          "before",
          "mandatoryTogether",
        ]),
        z.array(z.string()),
      )
      .optional(),
    minimumGoals: z.array(z.string()).optional(),
  })
  .passthrough();
export const sourceSchema = z
  .object({
    items: z.array(itemSchema).min(1),
    version: z.string().regex(/^\d+(\.\d+)+$/),
    startDate: z.string(),
    timestamp: z.string(),
    snapshotKey: z.uuid(),
    versionMajor: z.number(),
  })
  .passthrough();
export function parseSource(input: unknown) {
  const result = sourceSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid source schema (${result.error.issues.length} issues): ${JSON.stringify(result.error.issues.slice(0, 5))}`,
    );
  return result.data;
}
export type SourceItem = z.infer<typeof itemSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Label = { sourceKey: string; title: string };
export type Group = {
  sourceKey: string;
  code: string;
  title: string;
  routeKey: string;
  routeCode: z.infer<typeof routeSchema>;
  routeTitle: string;
};
export type Goal = {
  catalogVersion: string;
  goalId: string;
  sourceKey: string;
  sourceHref: string;
  wording: string;
  wordingText: string;
  clarification: string;
  clarificationText: string;
  sourceUrl: string;
  sourceDate: string;
  order: number;
  discipline: Label;
  domain: Label;
  subdomain?: Label;
  cluster?: Label;
  topicKeys: string[];
  group: Group;
  coherences: Record<string, string[]>;
  minimumGoals: string[];
  searchText: string;
};
export type GoalSet = {
  catalogVersion: string;
  key: string;
  topicKey: string;
  level: string;
  title: string;
  path: Label[];
  group: Group;
  goalIds: string[];
  goalCount: number;
  order: number;
  searchText: string;
};
export type Dataset = {
  catalogVersion: string;
  sourceUrl: string;
  sourceDate: string;
  sourceSha256: string;
  sourceMetadata: Record<string, unknown>;
  routes: { sourceKey: string; code: z.infer<typeof routeSchema>; title: string }[];
  groups: Group[];
  goals: Goal[];
  goalSets: GoalSet[];
  typeCounts: Record<string, number>;
};

// The untouched markup is kept as wording. This companion text is for search and model prompts.
// MathML fractions need a slash: flattening <mfrac> to "12" changes the goal's meaning.
export function sourceText(html: string): string {
  function walk(node: DefaultTreeAdapterTypes.ChildNode): string {
    if (node.nodeName === "#text")
      return (node as DefaultTreeAdapterTypes.TextNode).value;
    if (!("tagName" in node)) return "";
    if (["script", "style", "iframe"].includes(node.tagName)) return "";
    const children = node.childNodes.map(walk);
    if (node.tagName === "mfrac")
      return `(${children[0] ?? ""})/(${children[1] ?? ""})`;
    if (node.tagName === "msup")
      return `${children[0] ?? ""}^(${children[1] ?? ""})`;
    if (node.tagName === "msub")
      return `${children[0] ?? ""}_(${children[1] ?? ""})`;
    if (node.tagName === "msqrt") return `√(${children.join("")})`;
    if (node.tagName === "br") return "\n";
    return (
      children.join("") +
      (["p", "div", "li", "ul", "ol", "tr"].includes(node.tagName) ? "\n" : "")
    );
  }
  return parseFragment(html)
    .childNodes.map(walk)
    .join("")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
const levelByType: Record<string, string> = {
  KRC_CURRICULUM_DISCIPLINE: "discipline",
  KRC_CURRICULUM_DOMAIN: "domain",
  KRC_CURRICULUM_SUBDOMAIN: "subdomain",
  KRC_CURRICULUM_CLUSTER: "cluster",
};
function requireValue<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}
export function convertSource(input: unknown, sourceSha256: string): Dataset {
  const source = parseSource(input);
  const byHref = new Map<string, SourceItem>();
  const keys = new Set<string>();
  const codes = new Set<string>();
  const typeCounts: Record<string, number> = {};
  for (const item of source.items) {
    if (byHref.has(item.href) || keys.has(item.key))
      throw new Error(`Duplicate source identity: ${item.key}`);
    if (item.href !== `/content/${item.key}`)
      throw new Error(`Unexpected source href: ${item.href}`);
    keys.add(item.key);
    byHref.set(item.href, item);
    typeCounts[item.type] = (typeCounts[item.type] ?? 0) + 1;
  }
  const lookup = (href: string): SourceItem =>
    requireValue(byHref.get(href), `Unresolved reference: ${href}`);
  for (const item of source.items) {
    if (
      item.parentHref &&
      !(lookup(item.parentHref).childrenHrefs ?? []).includes(item.href)
    )
      throw new Error(`Parent/child mismatch: ${item.key}`);
    for (const href of item.childrenHrefs ?? [])
      if (lookup(href).parentHref !== item.href)
        throw new Error(`Child/parent mismatch: ${href}`);
    for (const href of item.themes ?? []) lookup(href);
    for (const refs of Object.values(item.coherences ?? {}))
      for (const href of refs ?? []) {
        if (lookup(href).type !== "KRC_CURRICULUM_GOAL")
          throw new Error(`Invalid goal relationship: ${href}`);
      }
    for (const ref of [
      item.discipline,
      item.domain,
      item.subdomain,
      item.ageRange,
    ])
      if (ref) lookup(ref.href);
    const visited = new Set([item.href]);
    let parent = item.parentHref;
    while (parent) {
      if (visited.has(parent)) throw new Error(`Cycle: ${item.key}`);
      visited.add(parent);
      parent = lookup(parent).parentHref;
    }
  }
  const routes = source.items
    .filter((x) => x.type === "KRC_GOAL_SET")
    .map((x) => ({
      sourceKey: x.key,
      code: routeSchema.parse(x.identifier),
      title: requireValue(x.description, `Missing route title: ${x.key}`),
    }));
  if (new Set(routes.map((x) => x.code)).size !== routes.length)
    throw new Error("Duplicate route codes");
  const groups: Group[] = source.items
    .filter((x) => x.type === "KRC_AGE_RANGE")
    .map((x) => {
      const route = requireValue(
        routes.find(
          (r) =>
            r.sourceKey ===
            lookup(requireValue(x.parentHref, "Missing group route")).key,
        ),
        "Unknown group route",
      );
      return {
        sourceKey: x.key,
        code: requireValue(x.identifier, "Missing group code"),
        title: requireValue(x.title, "Missing group label"),
        routeKey: route.sourceKey,
        routeCode: routeSchema.parse(route.code),
        routeTitle: route.title,
      };
    });
  const goalSets = new Map<string, GoalSet>();
  const goals: Goal[] = source.items
    .filter((x) => x.type === "KRC_CURRICULUM_GOAL")
    .map((item) => {
      const goalId = requireValue(
        item.identifier,
        `Missing goal code: ${item.key}`,
      );
      if (codes.has(goalId)) throw new Error(`Duplicate goal code: ${goalId}`);
      codes.add(goalId);
      const wording = requireValue(item.title, `Missing wording: ${goalId}`);
      if (!sourceText(wording)) throw new Error(`Empty wording: ${goalId}`);
      const localAge = lookup(
        requireValue(item.parentHref, "Goal without age parent"),
      );
      const localRoute = lookup(
        requireValue(localAge.parentHref, "Age without route parent"),
      );
      if (
        localAge.type !== "KRC_AGE_RANGE_ITEM" ||
        localRoute.type !== "KRC_GOAL_SET_ITEM" ||
        localAge.themes?.length !== 1 ||
        localRoute.themes?.length !== 1
      )
        throw new Error(`Unexpected group structure: ${goalId}`);
      const group = requireValue(
        groups.find((g) => `/content/${g.sourceKey}` === localAge.themes![0]),
        `Unknown group: ${goalId}`,
      );
      if (
        `/content/${group.routeKey}` !== localRoute.themes[0] ||
        item.ageRange?.href !== localAge.themes[0] ||
        localAge.identifier !== group.code ||
        localRoute.identifier !== group.routeCode
      )
        throw new Error(`Conflicting route/group: ${goalId}`);
      const ancestors: SourceItem[] = [];
      let parent = localRoute.parentHref;
      while (parent) {
        const p = lookup(parent);
        if (levelByType[p.type]) ancestors.unshift(p);
        parent = p.parentHref;
      }
      const label = (type: string): Label => {
        const node = requireValue(
          ancestors.find((x) => x.type === type),
          `Missing ${type}: ${goalId}`,
        );
        return {
          sourceKey: node.key,
          title: requireValue(
            node.title,
            `Missing hierarchy title: ${node.key}`,
          ),
        };
      };
      const discipline = label("KRC_CURRICULUM_DISCIPLINE"),
        domain = label("KRC_CURRICULUM_DOMAIN");
      const cluster = ancestors.some((x) => x.type === "KRC_CURRICULUM_CLUSTER")
        ? label("KRC_CURRICULUM_CLUSTER")
        : undefined;
      const subdomain = ancestors.some(
        (x) => x.type === "KRC_CURRICULUM_SUBDOMAIN",
      )
        ? label("KRC_CURRICULUM_SUBDOMAIN")
        : undefined;
      if (
        item.discipline?.href !== `/content/${discipline.sourceKey}` ||
        item.domain?.href !== `/content/${domain.sourceKey}` ||
        item.subdomain?.href !==
          (subdomain ? `/content/${subdomain.sourceKey}` : undefined)
      )
        throw new Error(`Conflicting goal hierarchy: ${goalId}`);
      const path = ancestors.map((x) => ({
        sourceKey: x.key,
        title: requireValue(x.title, "Missing topic title"),
      }));
      const clarification = item.description ?? "";
      const commonSearch = `${path.map((x) => sourceText(x.title)).join(" ")} ${group.title} ${group.code} ${group.routeTitle} ${group.routeCode}`;
      const goal: Goal = {
        catalogVersion: source.version,
        goalId,
        sourceKey: item.key,
        sourceHref: item.href,
        wording,
        wordingText: sourceText(wording),
        clarification,
        clarificationText: sourceText(clarification),
        sourceUrl: SOURCE_URL,
        sourceDate: source.startDate,
        order: item.orderInDocument,
        discipline,
        domain,
        ...(subdomain ? { subdomain } : {}),
        ...(cluster ? { cluster } : {}),
        topicKeys: path.map((x) => x.sourceKey),
        group,
        coherences: Object.fromEntries(
          Object.entries(item.coherences ?? {}).map(([k, refs]) => [
            k,
            (refs ?? []).map((h) => lookup(h).key),
          ]),
        ),
        minimumGoals: item.minimumGoals ?? [],
        searchText: normalizeSearch(
          `${goalId} ${commonSearch} ${sourceText(wording)} ${sourceText(clarification)}`,
        ),
      };
      path.forEach((topic, index) => {
        const key = `${topic.sourceKey}:${group.sourceKey}`;
        let set = goalSets.get(key);
        if (!set) {
          set = {
            catalogVersion: source.version,
            key,
            topicKey: topic.sourceKey,
            level: levelByType[ancestors[index].type],
            title: topic.title,
            path: path.slice(0, index + 1),
            group,
            goalIds: [],
            goalCount: 0,
            order: ancestors[index].orderInDocument,
            searchText: normalizeSearch(
              `${path
                .slice(0, index + 1)
                .map((x) => sourceText(x.title))
                .join(
                  " ",
                )} ${group.title} ${group.code} ${group.routeTitle} ${group.routeCode}`,
            ),
          };
          goalSets.set(key, set);
        }
        set.goalIds.push(goalId);
        set.goalCount++;
      });
      return goal;
    });
  const sourceMetadata = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "items"),
  );
  return {
    catalogVersion: source.version,
    sourceUrl: SOURCE_URL,
    sourceDate: source.startDate,
    sourceSha256,
    sourceMetadata,
    routes,
    groups,
    goals,
    goalSets: [...goalSets.values()],
    typeCounts,
  };
}
