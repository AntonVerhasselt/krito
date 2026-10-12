# Krito e-mails

Each file in this folder is one e-mail exactly as it's sent. To change an e-mail, edit its file; there's no template editor in Resend.

| File | E-mail | Sent when |
|---|---|---|
| [`report.md`](report.md) | Report (pdf attached) | An analysis finishes |
| [`reminder.md`](reminder.md) | "Stuur dit naar mezelf" link | A teacher asks for it on their phone |
| [`welcome-1-analysis.md`](welcome-1-analysis.md) | Welcome 1, has a report | 1 h after the address was first entered |
| [`welcome-1-no-analysis.md`](welcome-1-no-analysis.md) | Welcome 1, no report yet | 1 h after the address was first entered |
| [`welcome-2-analysis.md`](welcome-2-analysis.md) | Welcome 2, has a report | 2 days after welcome 1 |
| [`welcome-2-no-analysis.md`](welcome-2-no-analysis.md) | Welcome 2, no report yet | 2 days after welcome 1 |
| [`welcome-3.md`](welcome-3.md) | Welcome 3, everyone | 3 days after welcome 2 |

The "analysis" / "no-analysis" version is chosen **when the e-mail is sent**: does this address have a finished analysis at that moment?

## Format

```text
---
subject: Je verslag: {{topic}}, {{group}}
# Alternatives (not used, just notes):
# - Hier is je verslag van {{topic}}
---
Dag,

The body, in plain text, exactly as it's sent.
```

- **Frontmatter** (between the `---` lines):
  - `subject` is required.
  - Lines starting with `#` are notes and are ignored.
  - Keep subjects under about 60 characters. `{{topic}}` in a subject is cut off after 40 characters.
- **The body is plain text, not Markdown:**
  - `**bold**`, `# headings` and similar are sent literally, so don't use them.
  - A blank line starts a new paragraph.
  - A line beginning with `- ` is a list item.
  - A URL is clickable in the HTML version.
- **Variables:** `{{name}}`. Only the variables listed for an e-mail below can be used; anything else fails the build check.
- **Conditions:**
  - `{{#if name}}…{{/if}}`, or `{{#if name}}…{{else}}…{{/if}}`.
  - A variable is "true" when it is filled in and not 0.
- **Photo:** `{{photo}}` places the photo of Anton and Charlotte. It's only allowed in the welcome 1 files.
- **Signature:** every e-mail ends with "Anton"; there's no separate signature setting.

### Variables per e-mail

| Variable | Example | Available in |
|---|---|---|
| `topic` | `Magnetisme` | report, reminder, welcome-2-no-analysis |
| `group` | `3de leerjaar` | report, reminder, welcome-2-no-analysis |
| `date` | `12-10-2026` | report |
| `files` | `3 bestanden` / `1 bestand` | report |
| `goals` | `12 leerdoelen` / `1 leerdoel` | report |
| `covered`, `partial`, `notFound`, `uncertain` | `7` (0 = false in `#if`) | report |
| `reviewGoals` | `2 doelen` / `1 doel` (empty when 0) | report |
| `skippedFiles` | `les.docx, toets.pptx`: files Krito couldn't read (empty when none) | report |
| `materialLink` | `https://www.krito.be/materiaal?onderwerp=…` | reminder, welcome-2-no-analysis |
| `siteLink` | `https://www.krito.be` | all welcome e-mails |
| `email` | `juf.an@school.be` | all welcome e-mails |
| `unsubscribeLink` | `https://www.krito.be/uitschrijven?t=…` | all welcome e-mails (**required**) |

In `welcome-2-no-analysis.md`, `topic`, `group` and `materialLink` are only filled in when the teacher used the mobile "stuur dit naar mezelf" link. Use `{{#if materialLink}}` for those lines.

## After editing

```bash
npm run emails:build   # turns these files into shared/email/content.generated.ts
npm run emails:preview # prints every e-mail with sample data, both versions
npm test               # fails if the generated file is out of date or a variable is unknown
npx convex run node/email:sendSamples '{"to":"anton@trooper.be"}'   # all e-mails to an allowlisted inbox
```

Then deploy as usual. Nothing in Resend needs to change.

## Rules for the copy

- **Flemish Dutch, informal "je".** Use the site's words: *leerplandoel*, *lesmateriaal*, *nakijken*, *Gedekt / Gedeeltelijk gedekt / Niet gevonden / Onzeker*, *Kijk zelf na*.
- **One question per e-mail.** Replies go to Anton.
- **The first line shows as the inbox preview.** It has to work on its own.
- **Never write:**
  - "minimumdoelen" for per-year goals (a direct quote is fine);
  - anything about what pupils know or can do;
  - "inspectieklaar" or "bewijs voor de inspectie";
  - any link with or approval by Katholiek Onderwijs Vlaanderen;
  - time savings without a source;
  - "geen account";
  - how long files are kept.
- **Anton isn't a teacher**, and the e-mails don't pretend he is.
