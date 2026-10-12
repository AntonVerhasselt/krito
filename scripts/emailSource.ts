import { readFileSync, readdirSync } from "node:fs";
import { TEMPLATE_IDS, parseEmailFile, validateTemplate, type Template, type TemplateId } from "../shared/email/template";

export const GENERATED_EMAILS = "shared/email/content.generated.ts";

/** Reads and checks emails/*.md; throws with every problem listed per file. */
export function readEmails(dir = "emails"): Record<TemplateId, Template> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  const problems: string[] = [];
  for (const f of files)
    if (!TEMPLATE_IDS.includes(f.replace(/\.md$/, "") as TemplateId))
      problems.push(`${dir}/${f}: unknown e-mail; expected one of ${TEMPLATE_IDS.join(", ")}`);
  const templates = {} as Record<TemplateId, Template>;
  for (const id of TEMPLATE_IDS) {
    const path = `${dir}/${id}.md`;
    try {
      const template = parseEmailFile(readFileSync(path, "utf8"));
      for (const problem of validateTemplate(id, template)) problems.push(`${path}: ${problem}`);
      templates[id] = template;
    } catch (e) {
      problems.push(`${path}: ${(e as Error).message}`);
    }
  }
  if (problems.length) throw new Error(`E-mail content has problems:\n- ${problems.join("\n- ")}`);
  return templates;
}

/** The generated module Convex imports: e-mail files can't be read at runtime. */
export function emailModuleSource(templates = readEmails()) {
  return `// Generated from emails/*.md by \`npm run emails:build\`. Do not edit; edit the md files.
import type { Template, TemplateId } from "./template";

export const emailContent: Record<TemplateId, Template> = ${JSON.stringify(templates, null, 2)};
`;
}
