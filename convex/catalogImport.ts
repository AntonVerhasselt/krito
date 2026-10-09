import { compareVersions } from "../shared/catalogSearch";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  counts,
  goalFields,
  goalSetFields,
  group,
  itemFields,
  routeCode,
} from "./catalogValidators";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

async function sha(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function catalog(ctx: MutationCtx, version: string) {
  const result = await ctx.db
    .query("catalogs")
    .withIndex("by_version", (q) => q.eq("catalogVersion", version))
    .unique();
  if (!result) throw new Error("Begin this version's import first");
  return result;
}
function assertDev() {
  if (process.env.APP_ENV !== "development")
    throw new Error("Development import only");
}
export const begin = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    assertDev();
    if (
      !args.catalogVersion ||
      !args.expected.items ||
      !args.expected.goals ||
      !args.expected.goalSets
    )
      throw new Error("Empty catalog");
    const existing = await ctx.db
      .query("catalogs")
      .withIndex("by_version", (q) =>
        q.eq("catalogVersion", args.catalogVersion),
      )
      .unique();
    if (existing) {
      if (
        existing.sourceSha256 !== args.sourceSha256 ||
        existing.datasetSha256 !== args.datasetSha256
      )
        throw new Error("Conflicting content in immutable catalog version");
      return { status: existing.status, imported: existing.imported };
    }
    await ctx.db.insert("catalogs", {
      ...args,
      imported: { items: 0, goals: 0, goalSets: 0 },
      verified: { items: 0, goals: 0, goalSets: 0 },
      status: "staging",
      importedAt: Date.now(),
    });
    return { status: "staging", imported: { items: 0, goals: 0, goalSets: 0 } };
  },
});
type Kind = "items" | "goals" | "goalSets";
async function batch(
  ctx: MutationCtx,
  version: string,
  kind: Kind,
  rows: unknown[],
  save: (c: Doc<"catalogs">) => Promise<number>,
) {
  assertDev();
  if (!rows.length || rows.length > 100)
    throw new Error("Batch size must be 1–100");
  const c = await catalog(ctx, version);
  if (c.status !== "staging")
    throw new Error("Published catalogs are immutable");
  const batchHash = await sha(rows);
  const existing = await ctx.db
    .query("catalogImportBatches")
    .withIndex("by_batch", (q) =>
      q
        .eq("catalogVersion", version)
        .eq("kind", kind)
        .eq("batchHash", batchHash),
    )
    .unique();
  if (existing) return { inserted: 0, repeatedBatch: true };
  const inserted = await save(c);
  const imported = { ...c.imported, [kind]: c.imported[kind] + inserted };
  if (imported[kind] > c.expected[kind])
    throw new Error("Import exceeds manifest count");
  await ctx.db.patch(c._id, { imported });
  await ctx.db.insert("catalogImportBatches", {
    catalogVersion: version,
    kind,
    batchHash,
    count: rows.length,
    verified: false,
  });
  return { inserted, repeatedBatch: false };
}
export const items = internalMutation({
  args: { catalogVersion: v.string(), rows: v.array(v.object(itemFields)) },
  handler: async (ctx, args) =>
    batch(ctx, args.catalogVersion, "items", args.rows, async () => {
      let inserted = 0;
      const keys = new Set<string>();
      for (const row of args.rows) {
        if (
          row.catalogVersion !== args.catalogVersion ||
          keys.has(row.sourceKey) ||
          row.source?.key !== row.sourceKey ||
          row.source?.href !== row.sourceHref ||
          row.source?.type !== row.type
        )
          throw new Error("Invalid/duplicate source row");
        keys.add(row.sourceKey);
        const rowHash = await sha(row);
        const existing = await ctx.db
          .query("catalogItems")
          .withIndex("by_version_key", (q) =>
            q
              .eq("catalogVersion", args.catalogVersion)
              .eq("sourceKey", row.sourceKey),
          )
          .unique();
        if (existing) {
          if (existing.rowHash !== rowHash)
            throw new Error("Conflicting source record");
        } else {
          await ctx.db.insert("catalogItems", { ...row, rowHash });
          inserted++;
        }
      }
      return inserted;
    }),
});
export const goals = internalMutation({
  args: { catalogVersion: v.string(), rows: v.array(v.object(goalFields)) },
  handler: async (ctx, args) =>
    batch(ctx, args.catalogVersion, "goals", args.rows, async (c) => {
      let inserted = 0;
      const ids = new Set<string>();
      for (const row of args.rows) {
        if (
          row.catalogVersion !== args.catalogVersion ||
          !row.goalId ||
          !row.wording.trim() ||
          !row.wordingText.trim() ||
          ids.has(row.goalId)
        )
          throw new Error("Invalid/duplicate goal");
        ids.add(row.goalId);
        if (
          !c.groups.some((g) => JSON.stringify(g) === JSON.stringify(row.group))
        )
          throw new Error("Unknown route/group mapping");
        const source = await ctx.db
          .query("catalogItems")
          .withIndex("by_version_key", (q) =>
            q
              .eq("catalogVersion", args.catalogVersion)
              .eq("sourceKey", row.sourceKey),
          )
          .unique();
        if (
          source?.type !== "KRC_CURRICULUM_GOAL" ||
          source.source.identifier !== row.goalId ||
          source.source.title !== row.wording ||
          (source.source.description ?? "") !== row.clarification
        )
          throw new Error("Goal wording differs from source");
        const rowHash = await sha(row);
        const existing = await ctx.db
          .query("goals")
          .withIndex("by_version_goal", (q) =>
            q
              .eq("catalogVersion", args.catalogVersion)
              .eq("goalId", row.goalId),
          )
          .unique();
        if (existing) {
          if (existing.rowHash !== rowHash)
            throw new Error("Conflicting goal in immutable version");
        } else {
          await ctx.db.insert("goals", { ...row, rowHash });
          inserted++;
        }
      }
      return inserted;
    }),
});
export const goalSets = internalMutation({
  args: { catalogVersion: v.string(), rows: v.array(v.object(goalSetFields)) },
  handler: async (ctx, args) =>
    batch(ctx, args.catalogVersion, "goalSets", args.rows, async (c) => {
      let inserted = 0;
      const keys = new Set<string>();
      for (const row of args.rows) {
        if (
          row.catalogVersion !== args.catalogVersion ||
          !row.title ||
          keys.has(row.key) ||
          row.key !== `${row.topicKey}:${row.group.sourceKey}` ||
          row.goalCount !== row.goalIds.length ||
          !row.goalCount ||
          new Set(row.goalIds).size !== row.goalIds.length
        )
          throw new Error("Invalid/duplicate topic group");
        keys.add(row.key);
        if (
          !c.groups.some((g) => JSON.stringify(g) === JSON.stringify(row.group))
        )
          throw new Error("Unknown route/group mapping");
        const rowHash = await sha(row);
        const existing = await ctx.db
          .query("goalSets")
          .withIndex("by_version_key", (q) =>
            q.eq("catalogVersion", args.catalogVersion).eq("key", row.key),
          )
          .unique();
        if (existing) {
          if (existing.rowHash !== rowHash)
            throw new Error("Conflicting topic group");
        } else {
          await ctx.db.insert("goalSets", { ...row, rowHash });
          inserted++;
        }
      }
      return inserted;
    }),
});
// Verify each imported batch against the reviewed dataset before allowing publication.
export const verifyBatch = internalMutation({
  args: {
    catalogVersion: v.string(),
    kind: v.union(
      v.literal("items"),
      v.literal("goals"),
      v.literal("goalSets"),
    ),
    rows: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    assertDev();
    const c = await catalog(ctx, args.catalogVersion);
    if (c.status !== "staging") throw new Error("Already published");
    const batchHash = await sha(args.rows);
    const b = await ctx.db
      .query("catalogImportBatches")
      .withIndex("by_batch", (q) =>
        q
          .eq("catalogVersion", args.catalogVersion)
          .eq("kind", args.kind)
          .eq("batchHash", batchHash),
      )
      .unique();
    if (!b) throw new Error("Unknown batch");
    if (b.verified) return { verified: 0 };
    for (const row of args.rows) {
      const stored =
        args.kind === "items"
          ? await ctx.db
              .query("catalogItems")
              .withIndex("by_version_key", (q) =>
                q
                  .eq("catalogVersion", args.catalogVersion)
                  .eq("sourceKey", row.sourceKey),
              )
              .unique()
          : args.kind === "goals"
            ? await ctx.db
                .query("goals")
                .withIndex("by_version_goal", (q) =>
                  q
                    .eq("catalogVersion", args.catalogVersion)
                    .eq("goalId", row.goalId),
                )
                .unique()
            : await ctx.db
                .query("goalSets")
                .withIndex("by_version_key", (q) =>
                  q
                    .eq("catalogVersion", args.catalogVersion)
                    .eq("key", row.key),
                )
                .unique();
      if (!stored || stored.rowHash !== (await sha(row)))
        throw new Error("Stored dataset verification failed");
    }
    const verified = {
      ...c.verified,
      [args.kind]: c.verified[args.kind] + b.count,
    };
    if (verified[args.kind] > c.expected[args.kind])
      throw new Error("Verification count exceeds expected count");
    await ctx.db.patch(c._id, { verified });
    await ctx.db.patch(b._id, { verified: true });
    return { verified: b.count };
  },
});
export const publish = internalMutation({
  args: { catalogVersion: v.string(), datasetSha256: v.string() },
  handler: async (ctx, args) => {
    assertDev();
    const c = await catalog(ctx, args.catalogVersion);
    if (c.datasetSha256 !== args.datasetSha256)
      throw new Error("Dataset checksum mismatch");
    for (const kind of ["items", "goals", "goalSets"] as const)
      if (
        c.imported[kind] !== c.expected[kind] ||
        c.verified[kind] !== c.expected[kind]
      )
        throw new Error(`Incomplete ${kind} import/verification`);
    if (c.status !== "published")
      await ctx.db.patch(c._id, {
        status: "published",
        publishedAt: Date.now(),
      });
    const pointer = await ctx.db
      .query("catalogPointers")
      .withIndex("by_name", (q) => q.eq("name", "current"))
      .unique();
    if (!pointer)
      await ctx.db.insert("catalogPointers", {
        name: "current",
        catalogVersion: args.catalogVersion,
      });
    else if (compareVersions(args.catalogVersion, pointer.catalogVersion) > 0)
      await ctx.db.patch(pointer._id, { catalogVersion: args.catalogVersion });
    return { status: "published", counts: c.imported };
  },
});
export const status = internalQuery({
  args: { catalogVersion: v.string() },
  handler: async (ctx, args) => {
    const c = await ctx.db
      .query("catalogs")
      .withIndex("by_version", (q) =>
        q.eq("catalogVersion", args.catalogVersion),
      )
      .unique();
    return c
      ? {
          status: c.status,
          imported: c.imported,
          expected: c.expected,
          verified: c.verified,
          sourceSha256: c.sourceSha256,
        }
      : null;
  },
});

export const ingest = internalAction({
  args: {
    catalogVersion: v.string(),
    kind: v.union(
      v.literal("items"),
      v.literal("goals"),
      v.literal("goalSets"),
    ),
    rows: v.array(v.any()),
  },
  handler: async (ctx, args): Promise<{ verified: number }> => {
    const { kind, ...payload } = args;
    // Target mutations retain strict validators; this action keeps CLI batches and verification together.
    await ctx.runMutation(internal.catalogImport[kind], payload);
    return await ctx.runMutation(internal.catalogImport.verifyBatch, args);
  },
});
export const auditType = internalQuery({
  args: { catalogVersion: v.string(), type: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("catalogItems")
      .withIndex("by_version_type", (q) =>
        q.eq("catalogVersion", args.catalogVersion).eq("type", args.type),
      )
      .collect();
    return { type: args.type, count: rows.length };
  },
});
