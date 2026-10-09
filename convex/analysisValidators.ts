import { v } from "convex/values";
import { group, label } from "./catalogValidators";
export const analysisStatus = v.union(
  v.literal("draft"),
  v.literal("queued"),
  v.literal("preparing"),
  v.literal("checking"),
  v.literal("rechecking"),
  v.literal("completed"),
  v.literal("failed"),
);
export const result = v.object({
  goalId: v.string(),
  status: v.union(
    v.literal("covered"),
    v.literal("partial"),
    v.literal("not_found"),
    v.literal("uncertain"),
  ),
  confidence: v.number(),
  confidenceReason: v.string(),
  explanation: v.string(),
  evidence: v.array(
    v.object({
      fileId: v.string(),
      page: v.number(),
      kind: v.union(v.literal("text"), v.literal("visual")),
      quote: v.union(v.string(), v.null()),
      description: v.string(),
    }),
  ),
  missingRequirements: v.array(v.string()),
});
export const snapshot = v.object({
  goalId: v.string(),
  catalogVersion: v.string(),
  wording: v.string(),
  wordingText: v.string(),
  clarification: v.string(),
  clarificationText: v.string(),
  sourceUrl: v.string(),
  sourceDate: v.string(),
  discipline: label,
  domain: label,
  subdomain: v.optional(label),
  cluster: v.optional(label),
  group,
});
export const manifest = v.object({
  fileId: v.string(),
  name: v.string(),
  pageCount: v.number(),
  bytes: v.number(),
});
export const topicSnapshot = v.object({
  key: v.string(),
  title: v.string(),
  catalogVersion: v.string(),
  path: v.array(label),
  group,
  goalCount: v.number(),
});
