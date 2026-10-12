import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GENERATED_EMAILS, emailModuleSource, readEmails } from "../scripts/emailSource";
import { TEMPLATE_IDS, parseEmailFile, renderTemplate, validateTemplate } from "../shared/email/template";
import { sampleVariables } from "../shared/email/samples";
import { materialUrl, trackedLink } from "../shared/email/variables";
import { schoolEmailProblem } from "../shared/emailPolicy";

describe("emails/*.md", () => {
  it("is compiled: run `npm run emails:build` after editing an e-mail", () => {
    expect(readFileSync(GENERATED_EMAILS, "utf8")).toBe(emailModuleSource());
  });

  it("renders every e-mail without leftovers, links or photos where they don't belong", () => {
    const templates = readEmails();
    for (const id of TEMPLATE_IDS) {
      const email = renderTemplate(templates[id], sampleVariables[id]);
      for (const part of [email.subject, email.text, email.html]) {
        expect(part, id).not.toMatch(/\{\{|\}\}|undefined|null/);
      }
      expect(email.subject.length, id).toBeLessThanOrEqual(60);
      expect(email.text.trimEnd().split("--")[0].trimEnd().endsWith("Anton") || email.text.includes("\nAnton\n"), id).toBe(true);
      expect(email.photo, id).toBe(id.startsWith("welcome-1"));
      expect(email.html.includes("cid:anton-charlotte"), id).toBe(email.photo);
      const link = "https://www.krito.be/uitschrijven?t=voorbeeld";
      expect(email.text.includes(link), id).toBe(id.startsWith("welcome"));
      expect(email.html.includes(`href="${link}"`), id).toBe(id.startsWith("welcome"));
    }
  });
});

describe("template language", () => {
  const report = () => readEmails().report;

  it("reports unknown variables, unclosed conditions and misplaced photos", () => {
    expect(validateTemplate("report", { subject: "Hoi {{naam}}", body: "x" })).toEqual([
      expect.stringContaining("unknown variable {{naam}}"),
    ]);
    expect(validateTemplate("reminder", { subject: "s", body: "{{#if topic}}x" })[0]).toContain("never closed");
    expect(validateTemplate("reminder", { subject: "s", body: "{{photo}}" })[0]).toContain("only allowed");
    expect(validateTemplate("welcome-3", { subject: "s", body: "Dag" })[0]).toContain("unsubscribeLink");
    // A link hidden behind a condition, or only used as one, does not count.
    for (const body of ["{{#if unsubscribeLink}}uitschrijven{{/if}}", "{{#if email}}{{unsubscribeLink}}{{/if}}"])
      expect(validateTemplate("welcome-3", { subject: "s", body })).toEqual([expect.stringContaining("always show")]);
  });

  it("parses frontmatter, ignoring notes", () => {
    expect(parseEmailFile('---\nsubject: "Hoi: {{topic}}"\n# Alternatives:\n# - iets\n---\nDag,\n')).toEqual({
      subject: "Hoi: {{topic}}",
      body: "Dag,\n",
    });
    expect(() => parseEmailFile("Dag,")).toThrow(/frontmatter/);
  });

  it("drops zero counts, uses the singular and leaves out the review line when nobody needs to look", () => {
    const text = renderTemplate(report(), {
      ...sampleVariables.report,
      files: "1 bestand",
      covered: 1,
      partial: 0,
      notFound: 0,
      uncertain: 0,
      reviewGoals: "",
    }).text;
    expect(text).toContain("Krito legde 1 bestand naast 6 leerdoelen:\n- 1 gedekt\n\nOp de eerste pagina");
    expect(text).not.toContain("twijfelde");
  });

  it("names files Krito couldn't read", () => {
    const text = renderTemplate(report(), { ...sampleVariables.report, skippedFiles: "kapot.docx, oud.ppt" }).text;
    expect(text).toContain("Deze bestanden kon Krito niet openen, dus ze zitten niet in de beoordeling: kapot.docx, oud.ppt.");
    expect(renderTemplate(report(), sampleVariables.report).text).not.toContain("niet openen");
  });

  it("cuts long topics in the subject only", () => {
    const topic = "Een heel lang onderwerp met veel woorden over magnetisme";
    const email = renderTemplate(report(), { ...sampleVariables.report, topic });
    expect(email.subject).toBe("Je verslag: Een heel lang onderwerp met veel…, 3de leerjaar");
    expect(email.text).toContain(topic);
  });

  it("shows plain addresses but tracks the html link", () => {
    const link = trackedLink("https://www.krito.be/", "welkom-2");
    const email = renderTemplate({ subject: "s", body: "Hier:\n{{siteLink}}\n" }, { siteLink: link });
    expect(email.text).toBe("Hier:\nhttps://www.krito.be/");
    expect(email.html).toContain('<a href="https://www.krito.be/?via=welkom-2">https://www.krito.be/</a>');
  });

  it("keeps the topic key readable in the reminder link", () => {
    expect(materialUrl("https://www.krito.be", { catalogVersion: "1.3", key: "a-1:b-2" })).toBe(
      "https://www.krito.be/materiaal?onderwerp=a-1:b-2&versie=1.3",
    );
  });

  it("escapes html in variables", () => {
    const email = renderTemplate({ subject: "s", body: "{{topic}}" }, { topic: "<b>Breuken & kommagetallen</b>" });
    expect(email.html).toContain("&lt;b&gt;Breuken &amp; kommagetallen&lt;/b&gt;");
  });
});

describe("school address rules", () => {
  it("are the same for the analysis and the reminder", () => {
    expect(schoolEmailProblem(" juf.an@school.be ")).toBeNull();
    expect(schoolEmailProblem("juf@gmail.com")).toBe("personal_email");
    expect(schoolEmailProblem("geen-adres")).toBe("invalid_email");
    expect(schoolEmailProblem(`${"a".repeat(250)}@x.be`)).toBe("invalid_email");
  });
});
