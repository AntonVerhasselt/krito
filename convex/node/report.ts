"use node";
import { ConvexError, v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { accessArgs } from "../analyses";
import { renderReport } from "../../shared/report/render";

/**
 * The pdf report of a finished analysis, rendered on demand and never stored.
 * The e-mailed copy comes from the same renderer (node/email.ts).
 */
export const download = action({
  args: accessArgs,
  returns: v.object({ fileName: v.string(), bytes: v.bytes() }),
  handler: async (ctx, args): Promise<{ fileName: string; bytes: ArrayBuffer }> => {
    const input = await ctx.runQuery(internal.reports.authorizedInput, args);
    if (!input) throw new ConvexError("unavailable");
    try {
      const { fileName, bytes } = await renderReport(input);
      return { fileName, bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer };
    } catch {
      throw new ConvexError("report_failed");
    }
  },
});
