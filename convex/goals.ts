import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import {
  normalizeSearch,
  parseCatalogSearch,
  matchesSearchTerms,
} from "../shared/catalogSearch";
import type { Doc } from "./_generated/dataModel";
async function published(ctx: QueryCtx, version?: string) {
  const selected =
    version ??
    (
      await ctx.db
        .query("catalogPointers")
        .withIndex("by_name", (q) => q.eq("name", "current"))
        .unique()
    )?.catalogVersion;
  if (!selected) return null;
  const c = await ctx.db
    .query("catalogs")
    .withIndex("by_version", (q) => q.eq("catalogVersion", selected))
    .unique();
  return c?.status === "published" ? c : null;
}
function publicGoal(g: Doc<"goals">) {
  return {
    goalId: g.goalId,
    sourceKey: g.sourceKey,
    catalogVersion: g.catalogVersion,
    wording: g.wording,
    wordingText: g.wordingText,
    clarification: g.clarification,
    clarificationText: g.clarificationText,
    discipline: g.discipline,
    domain: g.domain,
    subdomain: g.subdomain,
    cluster: g.cluster,
    group: g.group,
    sourceUrl: g.sourceUrl,
    sourceDate: g.sourceDate,
  };
}
function publicTopic(s: Doc<"goalSets">) {
  return {
    key: s.key,
    catalogVersion: s.catalogVersion,
    title: s.title,
    path: s.path,
    level: s.level,
    group: s.group,
    goalCount: s.goalCount,
  };
}
export const catalogInfo = query({
  args: {},
  handler: async (ctx) => {
    const c = await published(ctx);
    if (!c) return null;
    return {
      version: c.catalogVersion,
      sourceDate: c.sourceDate,
      sourceUrl: c.sourceUrl,
      counts: c.expected,
      routes: c.routes,
      groups: c.groups,
      typeCounts: c.typeCounts,
    };
  },
});
export const listGoalSets = query({
  args: {
    search: v.string(),
    catalogVersion: v.optional(v.string()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const c = await published(ctx, args.catalogVersion);
    if (!c)
      return {
        topics: [],
        matchingGoals: [],
        more: false,
        cursor: null as string | null,
      };
    const { search, groupCode, routeCode } = parseCatalogSearch(
      args.search,
      c.groups,
      c.routes,
    );
    const exact = await ctx.db
      .query("goals")
      .withIndex("by_version_goal", (q) =>
        q
          .eq("catalogVersion", c.catalogVersion)
          .eq("goalId", args.search.trim().toUpperCase()),
      )
      .unique();
    if (exact) {
      const topics = await Promise.all(
        exact.topicKeys
          .filter((topicKey) => topicKey === exact.subdomain?.sourceKey)
          .map((topicKey) =>
            ctx.db
              .query("goalSets")
              .withIndex("by_version_key", (q) =>
                q
                  .eq("catalogVersion", c.catalogVersion)
                  .eq("key", `${topicKey}:${exact.group.sourceKey}`),
              )
              .unique(),
          ),
      );
      return {
        topics: topics
          .filter((t): t is Doc<"goalSets"> => t !== null)
          .map(publicTopic),
        matchingGoals: [publicGoal(exact)],
        more: false,
        cursor: null,
      };
    }
    const paginationOpts = { numItems: 24, cursor: args.cursor ?? null };
    if (!search) {
      const topics = await ctx.db
        .query("goalSets")
        .withIndex("by_version_level", (q) =>
          q.eq("catalogVersion", c.catalogVersion).eq("level", "subdomain"),
        )
        .filter((q) =>
          q.and(
            groupCode ? q.eq(q.field("group.code"), groupCode) : true,
            routeCode ? q.eq(q.field("group.routeCode"), routeCode) : true,
          ),
        )
        .paginate(paginationOpts);
      return {
        topics: topics.page.map(publicTopic),
        matchingGoals: [],
        more: !topics.isDone,
        cursor: topics.continueCursor,
      };
    }
    const [topics, matchingGoals] = await Promise.all([
      ctx.db
        .query("goalSets")
        .withSearchIndex("search_topics", (q) => {
          let filter = q
            .search("searchText", search)
            .eq("catalogVersion", c.catalogVersion)
            .eq("level", "subdomain");
          if (groupCode) filter = filter.eq("group.code", groupCode);
          if (routeCode) filter = filter.eq("group.routeCode", routeCode);
          return filter;
        })
        .paginate(paginationOpts),
      ctx.db
        .query("goals")
        .withSearchIndex("search_goals", (q) => {
          let filter = q
            .search("searchText", search)
            .eq("catalogVersion", c.catalogVersion);
          if (groupCode) filter = filter.eq("group.code", groupCode);
          if (routeCode) filter = filter.eq("group.routeCode", routeCode);
          return filter;
        })
        .take(128),
    ]);
    const direct = matchingGoals.filter((g) =>
      matchesSearchTerms(g.searchText, search),
    );
    const topicRows = topics.page.filter((t) =>
      matchesSearchTerms(t.searchText, search),
    );
    // A teacher can find a topic through wording below it, even when that word is absent from its title.
    if (!args.cursor && topicRows.length < 12) {
      const seen = new Set(topicRows.map((t) => t.key));
      for (const g of direct) {
        for (const topicKey of g.subdomain ? [g.subdomain.sourceKey] : []) {
          const key = `${topicKey}:${g.group.sourceKey}`;
          if (seen.has(key) || topicRows.length >= 24) continue;
          const derived = await ctx.db
            .query("goalSets")
            .withIndex("by_version_key", (q) =>
              q.eq("catalogVersion", c.catalogVersion).eq("key", key),
            )
            .unique();
          if (derived) {
            topicRows.push(derived);
            seen.add(key);
          }
        }
      }
    }
    return {
      topics: topicRows.map(publicTopic),
      matchingGoals: direct.slice(0, 8).map(publicGoal),
      more: !topics.isDone,
      cursor: topics.continueCursor,
    };
  },
});
export const listGoals = query({
  args: {
    catalogVersion: v.string(),
    goalSetKey: v.string(),
    offset: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const c = await published(ctx, args.catalogVersion);
    if (!c) return { goals: [], total: 0, more: false };
    const s = await ctx.db
      .query("goalSets")
      .withIndex("by_version_key", (q) =>
        q.eq("catalogVersion", c.catalogVersion).eq("key", args.goalSetKey),
      )
      .unique();
    if (!s) return { goals: [], total: 0, more: false };
    const offset = Math.max(0, Math.floor(args.offset ?? 0));
    if (!Number.isFinite(offset) || offset > 10_000)
      throw new Error("Invalid offset");
    const search = normalizeSearch(args.search ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 16);
    if (search.length) {
      const candidates = await ctx.db
        .query("goals")
        .withSearchIndex("search_goals", (q) =>
          q
            .search("searchText", search.join(" "))
            .eq("catalogVersion", c.catalogVersion)
            .eq("group.sourceKey", s.group.sourceKey),
        )
        .take(1024);
      const filtered = candidates.filter((g) =>
        g.topicKeys.includes(s.topicKey),
      );
      return {
        goals: filtered.slice(offset, offset + 50).map(publicGoal),
        total: filtered.length,
        more: filtered.length > offset + 50,
      };
    }
    const rows = await Promise.all(
      s.goalIds.slice(offset, offset + 50).map((goalId) =>
        ctx.db
          .query("goals")
          .withIndex("by_version_goal", (q) =>
            q.eq("catalogVersion", c.catalogVersion).eq("goalId", goalId),
          )
          .unique(),
      ),
    );
    return {
      goals: rows.filter((g): g is Doc<"goals"> => g !== null).map(publicGoal),
      total: s.goalCount,
      more: s.goalCount > offset + 50,
    };
  },
});
export const getGoalSet = query({
  args: { catalogVersion: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const c = await published(ctx, args.catalogVersion);
    if (!c) return null;
    const topic = await ctx.db
      .query("goalSets")
      .withIndex("by_version_key", (q) =>
        q.eq("catalogVersion", c.catalogVersion).eq("key", args.key),
      )
      .unique();
    return topic?.level === "subdomain" ? publicTopic(topic) : null;
  },
});
