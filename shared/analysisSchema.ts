import { z } from "zod";
const nonempty = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
export const GoalResult = z
  .object({
    goalId: nonempty,
    status: z.enum(["covered", "partial", "not_found", "uncertain"]),
    confidence: z.number().int().min(0).max(100),
    confidenceReason: nonempty,
    explanation: nonempty,
    evidence: z.array(
      z
        .object({
          fileId: nonempty,
          page: z.number().int().min(1),
          kind: z.enum(["text", "visual"]),
          quote: z.string().nullable(),
          description: z.string(),
        })
        .strict(),
    ),
    missingRequirements: z.array(nonempty),
  })
  .strict();
export const AnalysisOutput = z
  .object({ results: z.array(GoalResult) })
  .strict();
export type GoalResult = z.infer<typeof GoalResult>;
export type AnalysisOutput = z.infer<typeof AnalysisOutput>;
export type FileManifest = {
  fileId: string;
  name: string;
  pageCount: number;
  bytes: number;
};
export const PRIMARY_MODEL = "gpt-6-luna";
export const RECHECK_MODEL = "gpt-6.1-sol";
/** Initial results below this confidence get an independent recheck. */
export const RECHECK_BELOW_CONFIDENCE = 60;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const MAX_FILES = 20;
/**
 * A file that is still validating after this long is restarted by the
 * recovery job. Validation only checks the stored upload (and reads a PDF), so
 * it takes seconds; a stale validation that still finishes is ignored.
 */
export const VALIDATION_TIMEOUT_MS = 3 * 60_000;
/**
 * Preparation converts and seals every file when the analysis starts. Each
 * finished file counts as progress; without progress for this long the
 * recovery job starts it again. The slowest conversion (retries plus the
 * converter's own timeout) takes about three minutes.
 */
export const PREPARATION_TIMEOUT_MS = 5 * 60_000;
