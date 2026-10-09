import { v } from "convex/values";
export const routeCode = v.union(
  v.literal("P"),
  v.literal("G"),
  v.literal("Z"),
  v.literal("S"),
  v.literal("+"),
  v.literal("A"),
  v.literal("V"),
);
export const label = v.object({ sourceKey: v.string(), title: v.string() });
export const group = v.object({
  sourceKey: v.string(),
  code: v.string(),
  title: v.string(),
  routeKey: v.string(),
  routeCode,
  routeTitle: v.string(),
});
export const goalFields = {
  catalogVersion: v.string(),
  goalId: v.string(),
  sourceKey: v.string(),
  sourceHref: v.string(),
  wording: v.string(),
  wordingText: v.string(),
  clarification: v.string(),
  clarificationText: v.string(),
  sourceUrl: v.string(),
  sourceDate: v.string(),
  order: v.number(),
  discipline: label,
  domain: label,
  subdomain: v.optional(label),
  cluster: v.optional(label),
  topicKeys: v.array(v.string()),
  group,
  coherences: v.record(v.string(), v.array(v.string())),
  minimumGoals: v.array(v.string()),
  searchText: v.string(),
};
export const goalSetFields = {
  catalogVersion: v.string(),
  key: v.string(),
  topicKey: v.string(),
  level: v.union(
    v.literal("discipline"),
    v.literal("domain"),
    v.literal("subdomain"),
    v.literal("cluster"),
  ),
  title: v.string(),
  path: v.array(label),
  group,
  goalIds: v.array(v.string()),
  goalCount: v.number(),
  order: v.number(),
  searchText: v.string(),
};
export const itemFields = {
  catalogVersion: v.string(),
  sourceKey: v.string(),
  sourceHref: v.string(),
  type: v.string(),
  parentKey: v.optional(v.string()),
  source: v.any(),
};
export const counts = v.object({
  items: v.number(),
  goals: v.number(),
  goalSets: v.number(),
});
