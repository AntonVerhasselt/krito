import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { fileTypeOf } from "../../shared/fileTypes";

const examples = [
  { name: "lesson.docx", pages: 2, text: ["Breuken", "Drie vierde is 3/4"] },
  { name: "slides.pptx", pages: 2, text: ["Breuken", "Een half is twee vierden"] },
  { name: "scores.xlsx", pages: 2, text: ["Breuken", "Oefeningen", "Een vierde van twaalf blokjes"] },
  { name: "dutch.csv", pages: 1, text: ["café; oefeningen", "3,5"] },
  { name: "windows-1252.txt", pages: 1, text: ["Café", "Een half is twee vierden"] },
  { name: "pages5-file.pages", pages: 1, text: [] },
  { name: "keynote6-file.key", pages: 1, text: [] },
  { name: "numbers3-file.numbers", pages: 1, text: [] },
];

export function converterFixtures() {
  return examples.map((example) => ({
    ...example,
    bytes: readFileSync(new URL(`../fixtures/converter/${example.name}`, import.meta.url)),
    type: fileTypeOf(example.name)!,
  }));
}

export type ConverterFixture = ReturnType<typeof converterFixtures>[number];

/** Detect blank, truncated, encrypted and incorrectly paginated conversions. */
export async function checkConvertedPdf(bytes: Uint8Array, fixture: ConverterFixture) {
  assert(Buffer.from(bytes).subarray(0, 1024).includes(Buffer.from("%PDF-")), `${fixture.name}: expected a PDF`);
  const pdf = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    throwOnInvalidObject: true,
    updateMetadata: false,
  });
  assert.equal(pdf.isEncrypted, false, `${fixture.name}: unexpected encryption`);
  assert.equal(pdf.getPageCount(), fixture.pages, `${fixture.name}: incorrect page count`);
  if (fixture.text.length) {
    const text = execFileSync("pdftotext", ["-layout", "-", "-"], {
      input: bytes,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).replace(/\s+/g, " ");
    for (const expected of fixture.text)
      assert(text.includes(expected), `${fixture.name}: missing text ${JSON.stringify(expected)}`);
  }
}
