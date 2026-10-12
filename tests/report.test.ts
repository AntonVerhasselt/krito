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

  it("keeps the notation symbols of real Op.stap goals", async () => {
    const input = demoReportInput();
    input.goals[0].snapshot.wordingText =
      "De leerlingen kennen de wiskundige notaties: ∥ (evenwijdig), ⊥ (loodrecht), ∦ (snijdend) [F].";
    input.goals[1].snapshot.wordingText = "De leerling kan spanning aangeven via een non\u2011verbaal signaal.";
    const text = pdfText((await renderReport(input)).bytes);
    expect(text).toContain("∥ (evenwijdig), ⊥ (loodrecht), ∦ (snijdend)");
    expect(text).toContain("non-verbaal");
  }, 30_000);

  it("lets a very long quote continue on the next page instead of cutting it off", async () => {
    const input = demoReportInput();
    const long = Array.from({ length: 300 }, (_, i) => `Zin ${i + 1} uit een heel lange lesvoorbereiding.`).join(" ");
    input.goals[0].result.evidence[0].quote = `${long} Einde citaat.`;
    const text = pdfText((await renderReport(input)).bytes);
    expect(text).toContain("Einde citaat.");
    expect(text).toContain("Zin 300 uit");
  }, 60_000);

  it("shortens a long topic title in the footer so it never meets the page number", async () => {
    const input = demoReportInput();
    input.topic = {
      ...input.topic,
      title: "Begrippen, begripsvorming, wiskundige notaties en conventies, eigenschappen van en relaties tussen bewerkingen",
    };
    const { bytes } = await renderReport(input);
    const file = join(mkdtempSync(join(tmpdir(), "krito-report-")), "report.pdf");
    writeFileSync(file, bytes);
    const words = execFileSync("pdftotext", ["-bbox", "-f", "1", "-l", "1", file, "-"], { encoding: "utf8" });
    const boxes = [...words.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="[\d.]+">([^<]*)<\/word>/g)]
      .map(([, x0, y, x1, w]) => ({ x0: +x0, y: +y, x1: +x1, w }))
      .filter((b) => b.y > 800);
    const counter = boxes.find((b) => b.w === "pagina")!;
    expect(counter).toBeDefined();
    const footerText = boxes.filter((b) => b.x0 < counter.x0);
    expect(Math.max(...footerText.map((b) => b.x1))).toBeLessThan(counter.x0);
    expect(footerText.map((b) => b.w).join(" ")).toContain("…");
  }, 30_000);

  it("is identical on every render, so a retried e-mail sends the same attachment", async () => {
    const first = await renderReport(demoReportInput());
    const second = await renderReport(demoReportInput());
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  }, 30_000);

  it("survives symbols and an overview that runs onto the next page", async () => {
    const { bytes } = await renderReport(largeReportInput(40));
    const text = pdfText(bytes);
    expect(text).toContain("9.9.GL40");
    expect(text).toContain("≤");
  }, 60_000);
});
