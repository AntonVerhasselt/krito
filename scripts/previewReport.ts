import { writeFileSync } from "node:fs";
import { renderReport } from "../shared/report/render";
import { demoReportInput, largeReportInput } from "../tests/fixtures/report";

/** Renders the demo report and a 268-goal report to /tmp for a visual check. */
for (const [name, input] of [["demo", demoReportInput()], ["large", largeReportInput()]] as const) {
  const started = Date.now();
  const { bytes, fileName } = await renderReport(input);
  const path = `/tmp/krito-report-${name}.pdf`;
  writeFileSync(path, bytes);
  console.log(`${path}: ${fileName}, ${Math.round(bytes.length / 1024)} kB, ${Date.now() - started} ms`);
}
