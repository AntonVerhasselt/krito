import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { checkConvertedPdf, converterFixtures } from "./helpers/converterFixtures";

// Blank-page extraction returns no text, without requiring Poppler in unit tests.
vi.mock("node:child_process", () => ({ execFileSync: vi.fn(() => "") }));

describe("converter fixture content checks", () => {
  it.each(converterFixtures())("rejects a blank PDF with the correct page count for $name", async (fixture) => {
    const pdf = await PDFDocument.create();
    for (let page = 0; page < fixture.pages; page++) pdf.addPage();
    await expect(checkConvertedPdf(await pdf.save(), fixture)).rejects.toThrow("missing text");
  });
});
