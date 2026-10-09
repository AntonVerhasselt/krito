import type { MutationCtx } from "./_generated/server";
// This is an application profile/contact, not an authenticated Better Auth identity.
// Retain the exact trimmed email; do not merge plus aliases or rewrite local parts.
export async function getOrCreateUser(ctx: MutationCtx, email: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing) return existing._id;
  return ctx.db.insert("users", {
    email,
    emailVerified: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}
