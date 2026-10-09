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
