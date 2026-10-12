import { writeFileSync } from "node:fs";
import { GENERATED_EMAILS, emailModuleSource } from "./emailSource";

try {
  writeFileSync(GENERATED_EMAILS, emailModuleSource());
  console.log(`Wrote ${GENERATED_EMAILS}`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
