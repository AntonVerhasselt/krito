import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { emailKey, getOrCreateUser } from "./users";
export const extractEmails = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    if (process.env.APP_ENV !== "development")
      throw new Error("Development migration only");
    const page = await ctx.db
      .query("analyses")
      .paginate({ cursor: args.cursor, numItems: 100 });
    let moved = 0;
    for (const a of page.page) {
      if (!a.email) continue;
      const userId = await getOrCreateUser(ctx, a.email.trim());
      await ctx.db.patch(a._id, { userId, email: undefined });
      moved++;
    }
    return { moved, cursor: page.continueCursor, done: page.isDone };
  },
});
export const emailAudit = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (process.env.APP_ENV !== "development")
      throw new Error("Development migration only");
    const analyses = await ctx.db.query("analyses").collect();
    let missingProfiles = 0;
    for (const a of analyses)
      if (a.submittedAt && (!a.userId || !(await ctx.db.get(a.userId))))
        missingProfiles++;
    return {
      legacyEmails: analyses.filter((a) => !!a.email).length,
      missingProfiles,
    };
  },
});
/** Lowercased addresses for contacts created before the welcome sequence existed. */
export const emailKeys = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("users").paginate({ cursor: args.cursor, numItems: 200 });
    let updated = 0;
    for (const u of page.page) {
      if (u.emailKey) continue;
      await ctx.db.patch(u._id, { emailKey: emailKey(u.email) });
      updated++;
    }
    return { updated, cursor: page.continueCursor, done: page.isDone };
  },
});
