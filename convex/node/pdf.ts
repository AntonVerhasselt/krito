"use node";
import { createHash, randomUUID } from "node:crypto";
import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFDocument } from "pdf-lib";
import { v, ConvexError } from "convex/values";
import { internalAction } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { accessArgs } from "../analyses";
import { storage, object, signedGet } from "./storage";
import { MAX_FILE_BYTES } from "../../shared/analysisSchema";
import { fileTypeOf } from "../../shared/fileTypes";
import {
  convertsLocally,
  convertToPdf,
  imageToPdf,
  MAX_CONVERTED_BYTES,
} from "./convert";

/** Reads a stored object whose exact size is known, never more than `limit` bytes. */
async function readObject(
  key: string,
  declaredBytes: number,
  limit = MAX_FILE_BYTES,
) {
  const s3 = storage();
  const head = await s3.send(new HeadObjectCommand(object(key)));
  if (
    !head.ContentLength ||
    head.ContentLength !== declaredBytes ||
    head.ContentLength > limit
  )
    throw new Error("file_size_mismatch");
  const response = await s3.send(
    new GetObjectCommand({ ...object(key), IfMatch: head.ETag }),
  );
  if (!response.Body) throw new Error("invalid_pdf");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.Body.transformToWebStream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit || length > declaredBytes) {
        await reader.cancel();
        throw new Error("file_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (length !== declaredBytes) throw new Error("file_size_mismatch");
  return {
    bytes: Buffer.concat(chunks),
    etag: (response.ETag ?? head.ETag)!,
  };
}
export async function inspectPdf(
  key: string,
  declaredBytes: number,
  limit = MAX_FILE_BYTES,
) {
  const { bytes, etag } = await readObject(key, declaredBytes, limit);
  if (!bytes.subarray(0, 1024).includes(Buffer.from("%PDF-")))
    throw new Error("invalid_pdf");
  let pageCount: number;
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (pdf.isEncrypted) throw new Error("encrypted_pdf");
    pageCount = pdf.getPageCount();
    if (!pageCount) throw new Error("invalid_pdf");
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message))
      throw new Error("encrypted_pdf");
    // Encryption can fail strict object parsing before pdf-lib checks the encryption dictionary.
    // The tolerant read identifies encryption only; it never accepts a damaged PDF.
    try {
      await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        throwOnInvalidObject: false,
        updateMetadata: false,
      });
    } catch (fallback) {
      if (fallback instanceof Error && /encrypt/i.test(fallback.message))
        throw new Error("encrypted_pdf");
    }
    throw new Error("invalid_pdf");
  }
  return {
    actualBytes: bytes.length,
    pageCount,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    etag,
  };
}
/**
 * Validates an upload. Non-PDF material is converted first and stored next to
 * the upload as `<file>.pdf`; everything downstream only ever sees that PDF.
 */
async function prepareUpload(stagingKey: string, declaredBytes: number) {
  const type = fileTypeOf(stagingKey);
  if (!type) throw new Error("unsupported_type");
  if (type.kind === "pdf") return inspectPdf(stagingKey, declaredBytes);
  const { bytes } = await readObject(stagingKey, declaredBytes);
  let pdf: Buffer;
  if (convertsLocally(type)) pdf = await imageToPdf(bytes, type);
  else
    try {
      pdf = await convertToPdf(bytes, type);
    } catch (error) {
      // Cloud Run may still be starting; one more try covers a cold start.
      if (
        !(error instanceof Error) ||
        error.message !== "conversion_unavailable"
      )
        throw error;
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      pdf = await convertToPdf(bytes, type);
    }
  const pdfKey = stagingKey.replace(/\.[a-z0-9]+$/, ".pdf");
  await storage().send(
    new PutObjectCommand({
      ...object(pdfKey),
      Body: pdf,
      ContentType: "application/pdf",
    }),
  );
  return {
    ...(await inspectPdf(pdfKey, pdf.length, MAX_CONVERTED_BYTES)),
    pdfKey,
  };
}
export const signUpload = internalAction({
  args: {
    ...accessArgs,
    clientFileId: v.string(),
    name: v.string(),
    bytes: v.number(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    fileId: Id<"files">;
    uploadUrl: string;
    contentType: string;
  }> => {
    const registered = await ctx.runMutation(internal.files.register, args);
    const uploadUrl = await getSignedUrl(
      storage(),
      new PutObjectCommand({
        ...object(registered.key),
        ContentType: registered.contentType,
      }),
      { expiresIn: 300, signableHeaders: new Set(["content-type"]) },
    );
    return {
      fileId: registered.fileId,
      uploadUrl,
      contentType: registered.contentType,
    };
  },
});
export const signView = internalAction({
  args: { ...accessArgs, fileId: v.id("files"), page: v.number() },
  handler: async (ctx, args): Promise<string> => {
    const f = await ctx.runQuery(internal.files.viewContext, {
      analysisId: args.analysisId,
      accessToken: args.accessToken,
      fileId: args.fileId,
    });
    if (
      !Number.isInteger(args.page) ||
      args.page < 1 ||
      args.page > f.pageCount
    )
      throw new ConvexError("invalid_page");
    return `${await signedGet(f.key, 120)}#page=${args.page}`;
  },
});
export const validateFile = internalAction({
  args: { fileId: v.id("files"), generation: v.number() },
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(internal.files.validationContext, args);
    if (!file) return;
    try {
      await ctx.runMutation(internal.files.validated, {
        ...args,
        info: await prepareUpload(file.stagingKey, file.declaredBytes),
      });
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          "invalid_pdf",
          "encrypted_pdf",
          "unsupported_type",
          "conversion_failed",
          "conversion_unavailable",
          "converted_too_large",
          "file_size_mismatch",
          "file_too_large",
        ].includes(error.message)
          ? error.message
          : "upload_validation_failed";
      await ctx.runMutation(internal.files.validated, {
        ...args,
        safeError: code,
      });
    }
  },
});
export const prepare = internalAction({
  args: { analysisId: v.id("analyses"), attempt: v.number() },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.workflow.preparationContext,
      args,
    );
    if (!context) return;
    try {
      for (const file of context.files) {
        if (file.sealedKey) continue;
        const key = `sealed/${args.analysisId}/${args.attempt}/${file._id}-${randomUUID()}.pdf`;
        await storage().send(
          new CopyObjectCommand({
            ...object(key),
            CopySource: `${process.env.R2_BUCKET_NAME}/${file.pdfKey ?? file.stagingKey}`,
            CopySourceIfMatch: file.etag,
            MetadataDirective: "REPLACE",
            ContentType: "application/pdf",
          }),
        );
        try {
          const info = await inspectPdf(
            key,
            file.actualBytes!,
            MAX_CONVERTED_BYTES,
          );
          if (info.sha256 !== file.sha256 || info.pageCount !== file.pageCount)
            throw new Error("file_changed");
          const accepted = await ctx.runMutation(internal.workflow.sealed, {
            ...args,
            fileId: file._id,
            key,
          });
          if (!accepted)
            await storage().send(new DeleteObjectCommand(object(key)));
        } catch (error) {
          await storage()
            .send(new DeleteObjectCommand(object(key)))
            .catch(() => {});
          throw error;
        }
      }
      await ctx.runMutation(internal.workflow.prepared, args);
    } catch {
      await ctx.runMutation(internal.workflow.preparationFailed, args);
    }
  },
});
export const deleteObjects = internalAction({
  args: { keys: v.array(v.string()) },
  handler: async (_, { keys }) => {
    for (const key of keys) {
      if (!key.startsWith("staging/") && !key.startsWith("sealed/"))
        throw new Error("Invalid cleanup prefix");
      await storage().send(new DeleteObjectCommand(object(key)));
    }
  },
});
