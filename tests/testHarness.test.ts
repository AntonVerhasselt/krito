import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { MutationCtx } from "../convex/_generated/server";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { cleanup } from "../convex/testHarness";

const analysisId = "fixture-analysis" as Id<"analyses">;
const clean = (cleanup as unknown as {
  _handler: (ctx: MutationCtx, args: { analysisId: Id<"analyses"> }) => Promise<void>;
})._handler;

function fixtureContext(status: Doc<"analyses">["status"] = "draft", fileStatus: Doc<"files">["status"] = "validating") {
  const analysis = { _id: analysisId, fixture: "development-smoke", status };
  const file = { _id: "fixture-file", status: fileStatus, stagingKey: "staging/fixture/source.docx", pdfKey: undefined as string | undefined };
  const deleteRow = vi.fn();
  const runAfter = vi.fn<MutationCtx["scheduler"]["runAfter"]>()
    .mockResolvedValue("scheduled" as Id<"_scheduled_functions">);
  const query = vi.fn((table: string) => ({
    withIndex: vi.fn().mockReturnThis(),
    collect: async () => table === "files" ? [file] : [],
  }));
  const ctx = { db: { get: async () => analysis, query, delete: deleteRow }, scheduler: { runAfter } } as unknown as MutationCtx;
  return { ctx, analysis, file, deleteRow, runAfter };
}

beforeEach(() => vi.stubEnv("APP_ENV", "development"));
afterEach(() => vi.unstubAllEnvs());

describe("development fixture cleanup", () => {
  it("retains validating rows and later deletes the PDF recorded by the worker", async () => {
    const state = fixtureContext();
    await clean(state.ctx, { analysisId });
    expect(state.deleteRow).not.toHaveBeenCalled();
    expect(state.runAfter.mock.calls[0][0]).toBe(60_000);
    expect(getFunctionName(state.runAfter.mock.calls[0][1])).toBe("testHarness:cleanup");
    expect(state.runAfter.mock.calls[0][2]).toEqual({ analysisId });

    // Model the worker completing after the first cleanup attempt.
    state.file.status = "ready";
    state.file.pdfKey = "staging/fixture/source.pdf";
    state.runAfter.mockClear();
    await clean(state.ctx, { analysisId });
    expect(state.runAfter.mock.calls[0][0]).toBe(0);
    expect(getFunctionName(state.runAfter.mock.calls[0][1])).toBe("node/pdf:deleteObjects");
    expect(state.runAfter.mock.calls[0][2]).toEqual({ keys: ["staging/fixture/source.docx", "staging/fixture/source.pdf"] });
    expect(state.deleteRow).toHaveBeenCalledWith(state.file._id);
    expect(state.deleteRow).toHaveBeenCalledWith(analysisId);
  });

  it.each(["queued", "preparing", "checking", "rechecking"] as const)("defers while analysis work is %s", async (status) => {
    const state = fixtureContext(status, "ready");
    await clean(state.ctx, { analysisId });
    expect(state.deleteRow).not.toHaveBeenCalled();
    expect(state.runAfter.mock.calls[0][0]).toBe(60_000);
    expect(getFunctionName(state.runAfter.mock.calls[0][1])).toBe("testHarness:cleanup");
  });

  it("never deletes an unmarked teacher analysis", async () => {
    const state = fixtureContext("completed", "ready");
    state.analysis.fixture = "ordinary-analysis";
    await expect(clean(state.ctx, { analysisId })).rejects.toThrow("unmarked analysis");
    expect(state.deleteRow).not.toHaveBeenCalled();
    expect(state.runAfter).not.toHaveBeenCalled();
  });

  it("cannot run on a production backend", async () => {
    vi.stubEnv("APP_ENV", "production");
    const state = fixtureContext("completed", "ready");
    await expect(clean(state.ctx, { analysisId })).rejects.toThrow("Development fixtures only");
    expect(state.deleteRow).not.toHaveBeenCalled();
    expect(state.runAfter).not.toHaveBeenCalled();
  });
});
