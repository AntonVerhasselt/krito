"use node";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
export function storage() {
  if (
    process.env.APP_ENV !== "development" ||
    process.env.R2_BUCKET_NAME !== "krito-pdfs-dev"
  )
    throw new Error("storage_unavailable");
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}
export function object(key: string) {
  return { Bucket: process.env.R2_BUCKET_NAME!, Key: key };
}
export function signedGet(key: string, seconds: number) {
  return getSignedUrl(storage(), new GetObjectCommand(object(key)), {
    expiresIn: seconds,
  });
}
