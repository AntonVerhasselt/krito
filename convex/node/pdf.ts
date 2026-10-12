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
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { accessArgs } from "../analyses";
import { storage, object, signedGet } from "./storage";
import { MAX_FILE_BYTES } from "../../shared/analysisSchema";
import {
  convertsLocally,
  fileTypeOf,
  needsConversion,
  type FileType,
} from "../../shared/fileTypes";
import {
  ConverterUnavailable,
  converterConfig,
  convertToPdf,
  imageToPdf,
  damagedArchive,
  warmConverter as wakeConverter,
  MAX_CONVERTED_BYTES,
} from "./convert";

/** Reads a stored object whose exact size is known, never more than `limit` bytes. */
async function readObject(
  key: string,
  declaredBytes: number,
  limit = MAX_FILE_BYTES,
  expectedEtag?: string,
) {
  const s3 = storage();
  const head = await s3.send(new HeadObjectCommand(object(key)));
  if (
    !head.ContentLength ||
    head.ContentLength !== declaredBytes ||
    head.ContentLength > limit
  )
    throw new Error("file_size_mismatch");
  if (expectedEtag && head.ETag !== expectedEtag) throw new Error("file_changed");
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
/** Page count and checksum of a PDF; rejects damaged and encrypted files. */
async function readPdf(bytes: Buffer) {
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
  };
}
export async function inspectPdf(
  key: string,
  declaredBytes: number,
  limit = MAX_FILE_BYTES,
) {
  const { bytes, etag } = await readObject(key, declaredBytes, limit);
  return { ...(await readPdf(bytes)), etag };
}
/**
 * The converter may be starting (Cloud Run scales to zero) or busy when a
 * teacher submits many files at once, so quick unavailable answers are retried
 * with growing pauses. A timeout or missing configuration fails at once.
 *
 * LibreOffice answers 500 for damaged files as well as for passing resource
 * trouble, so a 500 is retried like an outage: by later preparation runs too.
 * Only in the last run, when every attempt got a 500 while the converter says
 * it's healthy, the file is taken to be the problem and left out. A broken zip
 * archive (truncated Office file) is recognised before converting.
 */
export async function convertWithRetries(
  bytes: Buffer,
  type: FileType,
  {
    fetchImpl = fetch,
    pauses = [2_000, 5_000, 15_000],
    lastRun = false,
  }: { fetchImpl?: typeof fetch; pauses?: number[]; lastRun?: boolean } = {},
) {
  if (damagedArchive(bytes, type)) throw new Error("conversion_failed");
  const config = converterConfig();
  let onlyServerErrors = true;
  for (const pause of [...pauses, null]) {
    try {
      return await convertToPdf(bytes, type, config, fetchImpl);
    } catch (error) {
      if (!(error instanceof ConverterUnavailable) || !error.retryable)
        throw error;
      onlyServerErrors &&= error.status === 500;
      if (pause === null) {
        if (lastRun && onlyServerErrors && (await wakeConverter(fetchImpl, config)))
          throw new Error("conversion_failed");
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
  throw new ConverterUnavailable(true);
}
/**
 * Checks a finished upload. A PDF is read completely (damaged and encrypted
 * files are refused while the teacher is still here); other material is only
 * checked for size and pinned by its ETag. It's converted when the analysis
 * starts.
 */
async function checkUpload(stagingKey: string, declaredBytes: number) {
  const type = fileTypeOf(stagingKey);
  if (!type) throw new Error("unsupported_type");
  if (!needsConversion(type)) return inspectPdf(stagingKey, declaredBytes);
  const head = await storage().send(new HeadObjectCommand(object(stagingKey)));
  if (head.ContentLength !== declaredBytes || !head.ETag)
    throw new Error("file_size_mismatch");
  return { etag: head.ETag };
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
        info: await checkUpload(file.stagingKey, file.declaredBytes),
      });
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          "invalid_pdf",
          "encrypted_pdf",
          "unsupported_type",
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
/** Problems with one file itself; the analysis goes on without it. */
const unreadable = new Set([
  "conversion_failed",
  "converted_too_large",
  "invalid_pdf",
  "encrypted_pdf",
  "unsupported_type",
  "file_size_mismatch",
  "file_too_large",
  "file_changed",
]);
type PrepareFile = Doc<"files">;
/**
 * Makes the private, immutable PDF an analysis reads. A PDF upload is copied;
 * other material is converted now and the PDF is written straight to its
 * sealed key.
 */
async function sealFile(
  file: PrepareFile,
  key: string,
  oneAtATime: <T>(work: () => Promise<T>) => Promise<T>,
  lastRun: boolean,
) {
  const type = fileTypeOf(file.name);
  if (!type) throw new Error("unsupported_type");
  if (!needsConversion(type) || file.pdfKey) {
    // Validated at upload (or converted by an earlier version): copy, then
    // make sure the copy is the file that was checked.
    await storage().send(
      new CopyObjectCommand({
        ...object(key),
        CopySource: `${process.env.R2_BUCKET_NAME}/${file.pdfKey ?? file.stagingKey}`,
        CopySourceIfMatch: file.etag,
        MetadataDirective: "REPLACE",
        ContentType: "application/pdf",
      }),
    );
    const info = await inspectPdf(key, file.actualBytes!, MAX_CONVERTED_BYTES);
    if (info.sha256 !== file.sha256 || info.pageCount !== file.pageCount)
      throw new Error("file_changed");
    return null;
  }
  const { bytes } = await readObject(
    file.stagingKey,
    file.declaredBytes,
    MAX_FILE_BYTES,
    file.etag,
  );
  // Local conversions hold the image twice; one at a time keeps that small.
  const pdf = convertsLocally(type)
    ? await oneAtATime(() => imageToPdf(bytes, type))
    : await convertWithRetries(bytes, type, { lastRun });
  const info = await readPdf(pdf);
  await storage().send(
    new PutObjectCommand({
      ...object(key),
      Body: pdf,
      ContentType: "application/pdf",
    }),
  );
  return info;
}
/** Runs `work` over `items`, at most `limit` at a time. */
async function eachLimited<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}
/** Runs the given work one call at a time, in order. */
function serial() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>) => {
    const next = last.then(work, work);
    last = next.catch(() => {});
    return next;
  };
}
export const prepare = internalAction({
  args: {
    analysisId: v.id("analyses"),
    attempt: v.number(),
    run: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.workflow.preparationContext,
      args,
    );
    if (!context) return;
    const oneAtATime = serial();
    const failures: { fileId: Id<"files">; code: string }[] = [];
    // Conversions run side by side; a few at a time keeps memory bounded.
    await eachLimited(context.files, 4, async (file) => {
      const key = `sealed/${args.analysisId}/${args.attempt}/${file._id}-${randomUUID()}.pdf`;
      const started = Date.now();
      try {
        const info = await sealFile(file, key, oneAtATime, context.lastRun);
        const accepted = await ctx.runMutation(internal.workflow.sealed, {
          analysisId: args.analysisId,
          attempt: args.attempt,
          fileId: file._id,
          key,
          info: info ?? undefined,
          durationMs: Date.now() - started,
        });
        if (!accepted)
          await storage().send(new DeleteObjectCommand(object(key)));
      } catch (error) {
        await storage()
          .send(new DeleteObjectCommand(object(key)))
          .catch(() => {});
        // A missing or replaced upload (uploads expire after a day, so an
        // old analysis retried later) is a problem of that file only.
        const name = error instanceof Error ? error.name : "";
        const code =
          error instanceof Error && unreadable.has(error.message)
            ? error.message
            : ["NotFound", "NoSuchKey", "PreconditionFailed"].includes(name)
              ? "file_changed"
              : error instanceof Error && error.message === "conversion_unavailable"
                ? "conversion_unavailable"
                : "preparation_failed";
        // No file names or contents: the id and extension are enough to
        // find the upload in the dashboard.
        console.error(
          `prepare ${args.analysisId}/${args.attempt}: ${file._id} (${fileTypeOf(file.name)?.extension}) ${code}`,
        );
        if (unreadable.has(code))
          await ctx.runMutation(internal.workflow.fileSkipped, {
            ...args,
            fileId: file._id,
            code,
            durationMs: Date.now() - started,
          });
        else failures.push({ fileId: file._id, code });
      }
    });
    if (failures.length)
      await ctx.runMutation(internal.workflow.preparationRetry, {
        ...args,
        failures,
      });
    else await ctx.runMutation(internal.workflow.prepared, args);
  },
});
/** Wakes the converter while the teacher is still adding files. */
export const warmConverter = internalAction({
  args: {},
  handler: async () => {
    await wakeConverter();
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
