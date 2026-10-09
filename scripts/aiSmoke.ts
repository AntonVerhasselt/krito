import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { z } from "zod";
import { assertDevelopment, cli, development, readEnv } from "./lib";

assertDevelopment();
const secrets = readEnv(".secrets/development.env");
if (!secrets.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is missing from the protected input file.");
const openai = new OpenAI({ apiKey: secrets.OPENAI_API_KEY, maxRetries: 0, timeout: 90_000 });
const output = z.object({ marker: z.string(), pageCount: z.number().int() });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage().drawText("Krito smoke fixture. Marker: KRITO-DEV-PDF-2026.", { x: 40, y: 700, size: 14, font });
const encoded = Buffer.from(await pdf.save()).toString("base64");
const models = ["gpt-6-luna", "gpt-6.1-sol"];

for (const model of models) {
  let responseId: string | undefined;
  try {
    let response = await openai.responses.create({
      model, background: true, store: true,
      input: [{ role: "user", content: [
        { type: "input_text", text: "Lees deze test-pdf. Geef de marker die begint met KRITO en het aantal pagina’s terug." },
        { type: "input_file", filename: "krito-smoke.pdf", detail: "auto", file_data: `data:application/pdf;base64,${encoded}` },
      ] }],
      text: { format: zodTextFormat(output, "pdf_smoke") },
    });
    responseId = response.id;
    const deadline = Date.now() + 5 * 60_000;
    while ((response.status === "queued" || response.status === "in_progress") && Date.now() < deadline) {
      console.log(`${model}: waiting for existing background response.`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      response = await openai.responses.retrieve(response.id);
    }
    if (response.status !== "completed") throw new Error("Response did not complete.");
    const text: string[] = [];
    for (const item of response.output) {
      if (item.type !== "message" || item.status !== "completed") continue;
      for (const content of item.content) {
        if (content.type === "refusal") throw new Error("Provider refused the fixture.");
        if (content.type === "output_text") text.push(content.text);
      }
    }
    const result = output.parse(JSON.parse(text.join("")));
    if (result.marker !== "KRITO-DEV-PDF-2026" || result.pageCount !== 1) throw new Error("PDF semantic verification failed.");
    console.log(`${model}: verified PDF input, strict structured output, background mode, and retrieval.`);
  } catch (error) {
    const status = error instanceof OpenAI.APIError ? error.status : undefined;
    console.error(`${model}: smoke test failed${status ? ` (HTTP ${status})` : ""}; model unchanged, raw provider output withheld.`);
    process.exitCode = 1;
    break;
  } finally {
    if (responseId) {
      try { await openai.responses.delete(responseId); }
      catch { console.warn(`${model}: response object cleanup failed; rerun cleanup manually.`); }
    }
  }
}

if (!process.exitCode) {
  cli("npx", ["convex", "env", "set", "AI_PRIMARY_MODEL", models[0], "--deployment", development.convexDeployment.slice(4)]);
  cli("npx", ["convex", "env", "set", "AI_RECHECK_MODEL", models[1], "--deployment", development.convexDeployment.slice(4)]);
  console.log("Verified model IDs saved to the selected Convex development deployment.");
}
