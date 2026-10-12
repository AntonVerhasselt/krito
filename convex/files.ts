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
import {
  convertsLocally,
  fileTypeOf,
  needsConversion,
} from "../shared/fileTypes";
import { captureAnalysis, captureAnalysisException } from "./analytics";
import { analyticsErrorCode } from "../shared/analytics";

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
    await captureAnalysis(ctx, a, "file_upload_registered", {
      file_id: fileId, extension: type.extension, file_kind: type.kind, bytes: args.bytes,
    }, now);
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
    const type = fileTypeOf(f.name);
    await captureAnalysis(ctx, a, "file_validation_started", {
      file_id: f._id, generation, extension: type?.extension, file_kind: type?.kind,
    });
    await ctx.scheduler.runAfter(0, internal.node.pdf.validateFile, {
      fileId: f._id,
      generation,
    });
    // Conversion waits for the analysis; a warm converter makes that quick.
    if (type && needsConversion(type) && !convertsLocally(type))
      await ctx.scheduler.runAfter(0, internal.node.pdf.warmConverter, {});
  },
});
export const remove = mutation({
  args: { ...accessArgs, fileId: v.id("files") },
  handler: async (ctx, args) => {
    const a = await requireAccess(ctx, args.analysisId, args.accessToken);
    const f = await ctx.db.get(args.fileId);
    if (a.status !== "draft" || f?.analysisId !== a._id)
      throw new ConvexError("file_unavailable");
    if (f.status === "removed") return;
    await ctx.db.patch(f._id, { status: "removed", updatedAt: Date.now() });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
    await captureAnalysis(ctx, a, "file_removed", { file_id: f._id });
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
    // A PDF is read completely; other uploads are only pinned by their ETag
    // and get their page count when they're converted for the analysis.
    info: v.optional(
      v.object({
        actualBytes: v.optional(v.number()),
        pageCount: v.optional(v.number()),
        sha256: v.optional(v.string()),
        etag: v.string(),
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
    const safeError = args.safeError;
    await ctx.db.patch(f._id, {
      ...(safeError ? {} : args.info),
      status: safeError ? "invalid" : "ready",
      safeError,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(a._id, { updatedAt: Date.now() });
    const type = fileTypeOf(f.name);
    const metadata = {
      file_id: f._id, generation: args.generation, extension: type?.extension,
      file_kind: type?.kind, duration_ms: Date.now() - f.updatedAt,
      page_count: args.info?.pageCount, bytes: f.declaredBytes,
    };
    await captureAnalysis(ctx, a, safeError ? "file_validation_failed" : "file_ready", {
      ...metadata, error_code: safeError ? analyticsErrorCode(safeError) : undefined,
    });
    if (safeError === "upload_validation_failed")
      await captureAnalysisException(ctx, a, safeError, "file_validation", metadata);
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
