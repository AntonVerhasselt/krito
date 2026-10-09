import { defineSchema, defineTable } from "convex/server";
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
});
