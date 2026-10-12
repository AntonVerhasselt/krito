import type { MutationCtx } from "./_generated/server";
// This is an application profile/contact, not an authenticated Better Auth identity.
// Retain the exact trimmed email; do not merge plus aliases or rewrite local parts.
export async function getOrCreateUser(ctx: MutationCtx, email: string) {
  return (await resolveContact(ctx, email)).userId;
}

export async function resolveContact(ctx: MutationCtx, email: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
  if (existing) return { userId: existing._id, created: false };
  const userId = await ctx.db.insert("users", {
    email,
    emailVerified: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { userId, created: true };
}
