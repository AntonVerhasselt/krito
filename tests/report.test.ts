import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildReportModel, reportFileName } from "../shared/report/model";
import { renderReport } from "../shared/report/render";
import { demoReportInput, largeReportInput } from "./fixtures/report";
import { reportVariables } from "../shared/email/variables";

const pdfText = (bytes: Uint8Array) => {
  const file = join(mkdtempSync(join(tmpdir(), "krito-report-")), "report.pdf");
  writeFileSync(file, bytes);
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
};

describe("report model", () => {
  it("counts verdicts and keeps the catalog order", () => {
    const model = buildReportModel(demoReportInput());
    expect(model.counts).toEqual({ covered: 2, partial: 2, not_found: 1, uncertain: 1 });
    expect(model.goals.map((g) => g.code)).toEqual(demoReportInput().goals.map((g) => g.snapshot.goalId));
    expect(model.date).toBe("12-10-2026");
    expect(model.files[0]).toEqual({ name: "Les magnetisme.pptx", pages: 14, size: "2,3 MB" });
  });

  it("names the file safely", () => {
    expect(reportFileName('Breuken: "deel" 1/2', "3de leerjaar", Date.UTC(2026, 0, 5, 23, 30))).toBe(
      "Krito - Breuken deel 1 2 3de leerjaar - 2026-01-06.pdf",
    );
  });

  it("feeds the report e-mail", () => {
    expect(reportVariables(buildReportModel(demoReportInput()))).toMatchObject({
      files: "3 bestanden",
      goals: "6 leerdoelen",
      reviewGoals: "1 doel",
    });
  });
});

describe("pdf report", () => {
  it("contains the overview and every goal with its evidence", async () => {
    const input = demoReportInput();
    const { bytes, fileName } = await renderReport(input);
    expect(fileName).toBe("Krito - Magnetisme 3de leerjaar - 2026-10-12.pdf");
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    const text = pdfText(bytes);
    for (const g of input.goals) expect(text.split(g.snapshot.goalId).length - 1).toBeGreaterThanOrEqual(2);
    expect(text).toContain("Alle leerdoelen");
    expect(text).toContain("Per leerdoel");
    expect(text).toContain("Een magneet oefent een kracht uit");
    expect(text).toMatch(/pagina 1 van \d/);
  }, 30_000);

  it("survives symbols and an overview that runs onto the next page", async () => {
    const { bytes } = await renderReport(largeReportInput(40));
    const text = pdfText(bytes);
    expect(text).toContain("9.9.GL40");
    expect(text).toContain("≤");
  }, 60_000);
});
