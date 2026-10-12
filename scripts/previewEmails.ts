import { writeFileSync } from "node:fs";
import { readEmails } from "./emailSource";
import { renderTemplate, TEMPLATE_IDS } from "../shared/email/template";
import { sampleVariables } from "../shared/email/samples";

/**
 * Prints every e-mail as it will be sent, from the md files with sample data,
 * and writes the html versions to /tmp. To receive them in a real inbox, run
 * `npx convex run node/email:sendSamples '{"to":"you@school.be"}'`.
 */
const templates = readEmails();
for (const id of TEMPLATE_IDS) {
  const email = renderTemplate(templates[id], sampleVariables[id]);
  writeFileSync(`/tmp/krito-email-${id}.html`, email.html);
  console.log(`\n=== ${id} ===\nSubject: ${email.subject}${email.photo ? "\n[photo inline]" : ""}\n\n${email.text}`);
}
console.log("\nHtml versions: /tmp/krito-email-*.html");
