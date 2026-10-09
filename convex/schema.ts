import { defineSchema, defineTable } from "convex/server";
import {
  analysisStatus,
  manifest,
  result,
  snapshot,
  topicSnapshot,
} from "./analysisValidators";
import { v } from "convex/values";
import {
  counts,
  goalFields,
  goalSetFields,
  group,
  itemFields,
  routeCode,
} from "./catalogValidators";

export default defineSchema({
  catalogPointers: defineTable({
    name: v.string(),
    catalogVersion: v.string(),
  }).index("by_name", ["name"]),
  catalogs: defineTable({
    catalogVersion: v.string(),
    sourceUrl: v.string(),
    sourceDate: v.string(),
    sourceSha256: v.string(),
    datasetSha256: v.string(),
    sourceMetadata: v.any(),
    routes: v.array(
      v.object({ sourceKey: v.string(), code: routeCode, title: v.string() }),
    ),
    groups: v.array(group),
    typeCounts: v.record(v.string(), v.number()),
    expected: counts,
    imported: counts,
    verified: counts,
    status: v.union(v.literal("staging"), v.literal("published")),
    importedAt: v.number(),
    publishedAt: v.optional(v.number()),
  })
    .index("by_version", ["catalogVersion"])
    .index("by_status", ["status", "publishedAt"]),
  catalogItems: defineTable({ ...itemFields, rowHash: v.string() })
    .index("by_version_key", ["catalogVersion", "sourceKey"])
    .index("by_version_type", ["catalogVersion", "type"])
    .index("by_version_parent", ["catalogVersion", "parentKey"]),
  goals: defineTable({ ...goalFields, rowHash: v.string() })
    .index("by_version_goal", ["catalogVersion", "goalId"])
    .index("by_version_order", ["catalogVersion", "order"])
    .index("by_version_group", ["catalogVersion", "group.sourceKey", "order"])
    .searchIndex("search_goals", {
      searchField: "searchText",
      filterFields: [
        "catalogVersion",
        "group.sourceKey",
        "group.code",
        "group.routeCode",
      ],
    }),
  goalSets: defineTable({ ...goalSetFields, rowHash: v.string() })
    .index("by_version_key", ["catalogVersion", "key"])
    .index("by_version_order", ["catalogVersion", "order"])
    .index("by_version_level", ["catalogVersion", "level", "order"])
    .searchIndex("search_topics", {
      searchField: "searchText",
      filterFields: [
        "catalogVersion",
        "level",
        "group.sourceKey",
        "group.code",
        "group.routeCode",
      ],
    }),
  catalogImportBatches: defineTable({
    catalogVersion: v.string(),
    kind: v.string(),
    batchHash: v.string(),
    count: v.number(),
    verified: v.boolean(),
  }).index("by_batch", ["catalogVersion", "kind", "batchHash"]),
  users: defineTable({
    email: v.string(),
    emailVerified: v.boolean(),
    authId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_auth", ["authId"]),
  analyses: defineTable({
    capabilityHash: v.string(),
    status: analysisStatus,
    catalogVersion: v.string(),
    goalSetKey: v.string(),
    goalIds: v.array(v.string()),
    topic: topicSnapshot,
    email: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    manifest: v.optional(v.array(manifest)),
    promptVersion: v.optional(v.string()),
    attempt: v.number(),
    recheckTotal: v.number(),
    recheckCompleted: v.number(),
    recoveryCount: v.number(),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    submittedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    testMode: v.optional(v.literal("deterministic")),
    fixture: v.optional(v.literal("development-smoke")),
  })
    .index("by_status_updated", ["status", "updatedAt"])
    .index("by_user", ["userId"]),
  files: defineTable({
    analysisId: v.id("analyses"),
    clientFileId: v.string(),
    name: v.string(),
    declaredBytes: v.number(),
    actualBytes: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    sha256: v.optional(v.string()),
    etag: v.optional(v.string()),
    stagingKey: v.string(),
    sealedKey: v.optional(v.string()),
    status: v.union(
      v.literal("uploading"),
      v.literal("validating"),
      v.literal("ready"),
      v.literal("invalid"),
      v.literal("removed"),
    ),
    validationGeneration: v.number(),
    validationRetries: v.optional(v.number()),
    safeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_analysis", ["analysisId"])
    .index("by_analysis_client", ["analysisId", "clientFileId"])
    .index("by_status_updated", ["status", "updatedAt"]),
  analysisGoals: defineTable({
    analysisId: v.id("analyses"),
    goalId: v.string(),
    order: v.number(),
    snapshot,
    lunaResult: v.optional(result),
    finalResult: v.optional(result),
    modelUsed: v.optional(v.string()),
    needsReview: v.boolean(),
    reviewReason: v.optional(v.string()),
  })
    .index("by_analysis_order", ["analysisId", "order"])
    .index("by_analysis_goal", ["analysisId", "goalId"]),
  aiRuns: defineTable({
    analysisId: v.id("analyses"),
    attempt: v.number(),
    generation: v.number(),
    stage: v.union(v.literal("initial"), v.literal("recheck")),
    goalId: v.optional(v.string()),
    order: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("creating"),
      v.literal("polling"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("interrupted"),
    ),
    responseId: v.optional(v.string()),
    retryCount: v.number(),
    pollCount: v.number(),
    pollFailures: v.number(),
    pollLeaseUntil: v.optional(v.number()),
    scheduledPollId: v.optional(v.id("_scheduled_functions")),
    deadline: v.number(),
    updatedAt: v.number(),
    safeError: v.optional(v.string()),
    requestShape: v.optional(
      v.object({
        model: v.string(),
        goalIds: v.array(v.string()),
        fileIds: v.array(v.string()),
        detail: v.string(),
      }),
    ),
  })
    .index("by_analysis_attempt_order", ["analysisId", "attempt", "order"])
    .index("by_scope", ["analysisId", "attempt", "stage", "goalId"])
    .index("by_status_updated", ["status", "updatedAt"]),
});
