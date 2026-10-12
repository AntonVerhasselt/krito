/**
 * The tiny template language of emails/*.md: {{name}}, {{#if name}}…{{else}}…{{/if}}
 * and {{photo}}. No dependency; every e-mail is checked at build time.
 */

export const TEMPLATE_IDS = [
  "report",
  "reminder",
  "welcome-1-analysis",
  "welcome-1-no-analysis",
  "welcome-2-analysis",
  "welcome-2-no-analysis",
  "welcome-3",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

const welcome = ["siteLink", "email", "unsubscribeLink"];
/** Which variables each e-mail may use. Documented in emails/README.md. */
export const TEMPLATE_VARIABLES: Record<TemplateId, string[]> = {
  report: ["topic", "group", "date", "files", "goals", "covered", "partial", "notFound", "uncertain", "reviewGoals"],
  reminder: ["topic", "group", "materialLink"],
  "welcome-1-analysis": welcome,
  "welcome-1-no-analysis": welcome,
  "welcome-2-analysis": welcome,
  "welcome-2-no-analysis": [...welcome, "topic", "group", "materialLink"],
  "welcome-3": welcome,
};
const PHOTO_ALLOWED = new Set<TemplateId>(["welcome-1-analysis", "welcome-1-no-analysis"]);
const UNSUBSCRIBE_REQUIRED = new Set<TemplateId>(TEMPLATE_IDS.filter((id) => id.startsWith("welcome-")));

/** A link shows its plain address in the text but may carry tracking in the html href. */
export type Link = { text: string; href: string };
export type Value = string | number | Link | null | undefined;
export type Variables = Record<string, Value>;
export type Template = { subject: string; body: string };

type Node =
  | { kind: "text"; value: string }
  | { kind: "var"; name: string }
  | { kind: "photo" }
  | { kind: "if"; name: string; then: Node[]; otherwise: Node[] };

const TOKEN = /\{\{\s*(#if\s+\w+|else|\/if|\w+)\s*\}\}/g;

export function parse(source: string): Node[] {
  const root: Node[] = [];
  const stack: { node: Extract<Node, { kind: "if" }>; inElse: boolean }[] = [];
  const target = () => {
    const top = stack.at(-1);
    return top ? (top.inElse ? top.node.otherwise : top.node.then) : root;
  };
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) target().push({ kind: "text", value: source.slice(last, match.index) });
    last = match.index + match[0].length;
    const token = match[1];
    if (token.startsWith("#if")) {
      const node = { kind: "if" as const, name: token.slice(3).trim(), then: [], otherwise: [] };
      target().push(node);
      stack.push({ node, inElse: false });
    } else if (token === "else") {
      const top = stack.at(-1);
      if (!top || top.inElse) throw new Error("{{else}} without an open {{#if}}");
      top.inElse = true;
    } else if (token === "/if") {
      if (!stack.pop()) throw new Error("{{/if}} without an open {{#if}}");
    } else if (token === "photo") target().push({ kind: "photo" });
    else target().push({ kind: "var", name: token });
  }
  if (stack.length) throw new Error(`{{#if ${stack.at(-1)!.node.name}}} is never closed with {{/if}}`);
  if (last < source.length) root.push({ kind: "text", value: source.slice(last) });
  if (/\{\{|\}\}/.test(source.replace(TOKEN, ""))) throw new Error("Malformed {{…}} tag");
  return root;
}

function names(nodes: Node[], into = new Set<string>()) {
  for (const n of nodes) {
    if (n.kind === "var") into.add(n.name);
    if (n.kind === "if") {
      into.add(n.name);
      names(n.then, into);
      names(n.otherwise, into);
    }
  }
  return into;
}
const hasPhoto = (nodes: Node[]): boolean =>
  nodes.some((n) => n.kind === "photo" || (n.kind === "if" && (hasPhoto(n.then) || hasPhoto(n.otherwise))));

/** Every problem in one e-mail file, in words its editor understands. */
export function validateTemplate(id: TemplateId, template: Template): string[] {
  const problems: string[] = [];
  if (!template.subject.trim()) problems.push("subject is missing");
  const allowed = new Set(TEMPLATE_VARIABLES[id]);
  for (const [part, source] of [["subject", template.subject], ["body", template.body]] as const) {
    let nodes: Node[];
    try {
      nodes = parse(source);
    } catch (e) {
      problems.push(`${part}: ${(e as Error).message}`);
      continue;
    }
    for (const name of names(nodes))
      if (!allowed.has(name))
        problems.push(`${part}: unknown variable {{${name}}}; allowed here: ${[...allowed].join(", ")}`);
    if (hasPhoto(nodes) && (part === "subject" || !PHOTO_ALLOWED.has(id)))
      problems.push(`${part}: {{photo}} is only allowed in the welcome 1 e-mails`);
    // The link itself must always be printed: not inside an {{#if}}, not only as a condition.
    if (part === "body" && UNSUBSCRIBE_REQUIRED.has(id) && !nodes.some((n) => n.kind === "var" && n.name === "unsubscribeLink"))
      problems.push("body: welcome e-mails must always show {{unsubscribeLink}} (outside any {{#if}})");
  }
  return problems;
}

const truthy = (value: Value) => value !== undefined && value !== null && value !== "" && value !== 0;
const asText = (value: Value) => (value && typeof value === "object" ? value.text : String(value ?? ""));

type Piece = { text: string } | { link: Link } | { photo: true };

function evaluate(nodes: Node[], vars: Variables, out: Piece[] = []) {
  for (const n of nodes) {
    if (n.kind === "text") out.push({ text: n.value });
    else if (n.kind === "photo") out.push({ photo: true });
    else if (n.kind === "var") {
      const value = vars[n.name];
      if (value === undefined || value === null) throw new Error(`Missing value for {{${n.name}}}`);
      out.push(typeof value === "object" ? { link: value } : { text: String(value) });
    } else evaluate(truthy(vars[n.name]) ? n.then : n.otherwise, vars, out);
  }
  return out;
}

/** Joins pieces into lines; a line that is only the photo becomes a marker. */
const PHOTO_LINE = "\u0000photo\u0000";
function tidy(text: string) {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export const PHOTO_CONTENT_ID = "anton-charlotte";

/**
 * Plain-looking html for one e-mail: paragraphs, lists, clickable links and
 * (welcome 1) the photo. No styling beyond the system font, so it reads like text.
 */
function toHtml(pieces: Piece[]) {
  // Work line by line, keeping links as placeholders so they survive escaping.
  const links: Link[] = [];
  let source = "";
  for (const p of pieces) {
    if ("text" in p) source += p.text;
    else if ("link" in p) source += `\u0001${links.push(p.link) - 1}\u0001`;
    else source += PHOTO_LINE;
  }
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`)
      .replace(/\u0001(\d+)\u0001/g, (_, i) => {
        const link = links[Number(i)];
        return `<a href="${escapeHtml(link.href)}">${escapeHtml(link.text)}</a>`;
      });
  const blocks = tidy(source).split(/\n{2,}/);
  let footer = false;
  const html = blocks.map((block) => {
    const lines = block.split("\n");
    if (lines[0] === "--") {
      footer = true;
      lines.shift();
      if (!lines.length) return "";
    }
    const style = footer ? ' style="color:#6b7471;font-size:13px"' : "";
    if (lines.length === 1 && lines[0] === PHOTO_LINE)
      return `<p><img src="cid:${PHOTO_CONTENT_ID}" width="240" height="320" alt="Anton met Charlotte in de zetel" style="display:block;border-radius:6px"></p>`;
    if (lines.every((l) => l.startsWith("- ")))
      return `<ul${style}>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
    const list = lines.findIndex((l) => l.startsWith("- "));
    if (list > 0 && lines.slice(list).every((l) => l.startsWith("- ")))
      return `<p${style}>${lines.slice(0, list).map(inline).join("<br>")}</p><ul${style}>${lines
        .slice(list)
        .map((l) => `<li>${inline(l.slice(2))}</li>`)
        .join("")}</ul>`;
    return `<p${style}>${lines.map(inline).join("<br>")}</p>`;
  });
  return `<!doctype html><html lang="nl"><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d2422;max-width:560px">${html.join("\n")}</body></html>`;
}

export type RenderedEmail = { subject: string; text: string; html: string; photo: boolean };

export function renderTemplate(template: Template, vars: Variables): RenderedEmail {
  const subjectVars = { ...vars };
  for (const [key, value] of Object.entries(subjectVars))
    if (typeof value === "string" && value.length > 40) {
      // Cut at a word boundary so the inbox shows whole words.
      const cut = value.slice(0, 39);
      const space = cut.lastIndexOf(" ");
      subjectVars[key] = `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
    }
  const subject = evaluate(parse(template.subject), subjectVars)
    .map((p) => ("text" in p ? p.text : "link" in p ? p.link.text : ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  const pieces = evaluate(parse(template.body), vars);
  const text = tidy(
    pieces
      .map((p) => ("text" in p ? p.text : "link" in p ? p.link.text : PHOTO_LINE))
      .join("")
      .split("\n")
      .filter((line) => line !== PHOTO_LINE)
      .join("\n"),
  );
  return { subject, text, html: toHtml(pieces), photo: pieces.some((p) => "photo" in p) };
}

/** Parses one emails/*.md file: frontmatter with `subject`, then the body. */
export function parseEmailFile(source: string): Template {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error("The file must start with a --- frontmatter block containing subject:");
  let subject = "";
  for (const line of match[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (!field) throw new Error(`Unreadable frontmatter line: ${line}`);
    if (field[1] !== "subject") throw new Error(`Unknown frontmatter field: ${field[1]}`);
    const raw = field[2].trim();
    subject = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  }
  return { subject, body: match[2].trim() + "\n" };
}

/** Keeps the html twin readable in tests and previews. */
export { asText };
