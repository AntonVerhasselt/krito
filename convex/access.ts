import { ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function authorized(
  ctx: QueryCtx | MutationCtx,
  analysisId: string,
  accessToken: string,
) {
  const id = ctx.db.normalizeId("analyses", analysisId);
  if (!id || !/^[a-f0-9]{64}$/.test(accessToken)) return null;
  const analysis = await ctx.db.get(id as Id<"analyses">);
  if (!analysis) return null;
  const hash = await tokenHash(accessToken);
  let difference = hash.length ^ analysis.capabilityHash.length;
  for (let i = 0; i < hash.length; i++)
    difference |=
      hash.charCodeAt(i) ^ (analysis.capabilityHash.charCodeAt(i) || 0);
  return difference === 0 ? analysis : null;
}
export async function requireAccess(
  ctx: QueryCtx | MutationCtx,
  id: string,
  token: string,
) {
  const analysis = await authorized(ctx, id, token);
  if (!analysis) throw new ConvexError("unavailable");
  return analysis;
}
