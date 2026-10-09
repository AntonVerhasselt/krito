"use node";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

function client() {
  if (process.env.APP_ENV !== "development" || process.env.R2_BUCKET_NAME !== "krito-pdfs-dev") {
    throw new ConvexError("Storage probe is only available in development.");
  }
  return new S3Client({
    region: "auto", endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
}

// Temporary setup-only capability; remove the backend token after acceptance.
// Generates only a non-sensitive fixture and never accepts teacher documents.
export const prepare = action({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const expected = process.env.SETUP_PROBE_TOKEN_HASH;
    const expires = Number(process.env.SETUP_PROBE_EXPIRES_AT ?? 0);
    const actual = createHash("sha256").update(token).digest("hex");
    if (!expected || Date.now() > expires || actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
      throw new ConvexError("Unavailable.");
    }
    const s3 = client();
    const key = `setup-smoke/${randomUUID()}.pdf`;
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText("Krito private R2 development fixture.", { x: 40, y: 700, font });
    const bytes = await pdf.save();
    const base = { Bucket: process.env.R2_BUCKET_NAME!, Key: key };
    await ctx.scheduler.runAfter(10 * 60_000, internal.node.storageSmoke.cleanup, { key });
    const [uploadUrl, downloadUrl] = await Promise.all([
      getSignedUrl(s3, new PutObjectCommand({ ...base, ContentType: "application/pdf" }), { expiresIn: 300 }),
      getSignedUrl(s3, new GetObjectCommand(base), { expiresIn: 300 }),
    ]);
    return { uploadUrl, downloadUrl, fixture: Buffer.from(bytes).toString("base64") };
  },
});

export const cleanup = internalAction({
  args: { key: v.string() },
  handler: async (_, { key }) => {
    if (!key.startsWith("setup-smoke/")) throw new Error("Unexpected fixture key.");
    await client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
  },
});
