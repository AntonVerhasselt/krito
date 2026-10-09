import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireAccess } from "./access";
import { accessArgs } from "./analyses";
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  MAX_FILES,
} from "../shared/analysisSchema";
import { fileTypeOf } from "../shared/fileTypes";

/** Every stored object of a file: the upload and, if converted, its PDF. */
export function fileKeys(f: {
  stagingKey: string;
  pdfKey?: string;
  sealedKey?: string;
}) {
  return [...new Set([f.stagingKey, f.pdfKey, f.sealedKey])].filter(
    (key): key is string => !!key,
  );
}
export const requestUpload = action({
  args: {
    ...accessArgs,
    clientFileId: v.string(),
    name: v.string(),
    bytes: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ fileId: Id<"files">; uploadUrl: string; contentType: string }> =>
    ctx.runAction(internal.node.pdf.signUpload, args),
});
export const getViewUrl = action({
  args: { ...accessArgs, fileId: v.id("files"), page: v.number() },
  handler: async (ctx, args): Promise<string> =>
    ctx.runAction(internal.node.pdf.signView, args),
});

export const register = internalMutation({
  args: {
    ...accessArgs,
    clientFileId: v.string(),
    name: v.string(),
    bytes: v.number(),
  },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    if (a.status !== "draft") throw new ConvexError("already_submitted");
    const type = fileTypeOf(args.name);
    if (!type) throw new ConvexError("unsupported_type");
    if (
      !/^[a-f0-9-]{36}$/.test(args.clientFileId) ||
      !args.name.trim() ||
      args.name.length > 255 ||
      !Number.isInteger(args.bytes) ||
      args.bytes < 1 ||
      args.bytes > MAX_FILE_BYTES
    )
      throw new ConvexError("file_too_large");
    const existing = await ctx.db
      .query("files")
      .withIndex("by_analysis_client", (q) =>
        q.eq("analysisId", a._id).eq("clientFileId", args.clientFileId),
      )
      .unique();
    if (existing) {
      if (
        existing.status !== "uploading" ||
        existing.declaredBytes !== args.bytes ||
        existing.name !== args.name
      )
        throw new ConvexError("file_unavailable");
      return {
        fileId: existing._id,
        key: existing.stagingKey,
        contentType: type.contentType,
      };
    }
    const files = await ctx.db
      .query("files")
      .withIndex("by_analysis", (q) => q.eq("analysisId", a._id))
      .collect();
    if (
      files
        .filter((f) => f.status !== "removed")
        .reduce((sum, f) => sum + f.declaredBytes, 0) +
        args.bytes >
        MAX_TOTAL_BYTES ||
      files.filter((f) => f.status !== "removed").length >= MAX_FILES
    )
      throw new ConvexError("total_too_large");
    const now = Date.now();
    const fileId = await ctx.db.insert("files", {
      analysisId: a._id,
      clientFileId: args.clientFileId,
      name: args.name,
      declaredBytes: args.bytes,
      stagingKey: "",
      status: "uploading",
      validationGeneration: 0,
      createdAt: now,
      updatedAt: now,
    });
    const key = `staging/${a._id}/${fileId}.${type.extension}`;
    await ctx.db.patch(fileId, { stagingKey: key });
    await ctx.db.patch(a._id, { updatedAt: now });
    return { fileId, key, contentType: type.contentType };
  },
});
export const completeUpload = mutation({
  args: { ...accessArgs, fileId: v.id("files") },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    const f = await ctx.db.get(args.fileId);
    if (
      a.status !== "draft" ||
      f?.analysisId !== a._id ||
      f.status === "removed"
    )
      throw new ConvexError("file_unavailable");
    if (f.status === "ready" || f.status === "validating") return;
    const generation = f.validationGeneration + 1;
    await ctx.db.patch(f._id, {
      status: "validating",
      validationGeneration: generation,
      validationRetries: 0,
      safeError: undefined,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.node.pdf.validateFile, {
      fileId: f._id,
      generation,
    });
  },
});
export const remove = mutation({
  args: { ...accessArgs, fileId: v.id("files") },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    const f = await ctx.db.get(args.fileId);
    if (a.status !== "draft" || f?.analysisId !== a._id)
      throw new ConvexError("file_unavailable");
    await ctx.db.patch(f._id, { status: "removed", updatedAt: Date.now() });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.node.pdf.deleteObjects, {
      keys: fileKeys(f),
    });
  },
});
export const validationContext = internalQuery({
  args: { fileId: v.id("files"), generation: v.number() },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.fileId);
    if (
      f?.status !== "validating" ||
      f.validationGeneration !== args.generation
    )
      return null;
    const a = await ctx.db.get(f.analysisId);
    return a?.status === "draft" ? f : null;
  },
});
export const validated = internalMutation({
  args: {
    fileId: v.id("files"),
    generation: v.number(),
    info: v.optional(
      v.object({
        actualBytes: v.number(),
        pageCount: v.number(),
        sha256: v.string(),
        etag: v.string(),
        pdfKey: v.optional(v.string()),
      }),
    ),
    safeError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.fileId);
    if (
      f?.status !== "validating" ||
      f.validationGeneration !== args.generation
    )
      return;
    const a = await ctx.db.get(f.analysisId);
    if (a?.status !== "draft") return;
    await ctx.db.patch(f._id, {
      ...args.info,
      status: args.info ? "ready" : "invalid",
      safeError: args.safeError,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
  },
});
export const viewContext = internalQuery({
  args: { ...accessArgs, fileId: v.id("files") },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    const f = await ctx.db.get(args.fileId);
    if (
      f?.analysisId !== a._id ||
      !f.sealedKey ||
      !a.manifest?.some((m) => m.fileId === f._id)
    )
      throw new ConvexError("file_unavailable");
    return { key: f.sealedKey, pageCount: f.pageCount!, name: f.name };
  },
});
