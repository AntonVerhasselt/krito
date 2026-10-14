# Accepted MVP changes

The user's instructions take precedence over the original specification in `docs/specification.md`.

## Catalog scope and teacher choice (2026-10-09)

- Import the complete current Op.stap snapshot for **all** disciplines, routes and source groups into Convex. Store all source records, hierarchy, relationships and source metadata, as well as normalized goals and browsing records.
- Use the complete JSON observed loading in the official site's browser, with a repeatable fetch/validate/import command. The user confirmed permission from the source owner for this MVP; commercial reuse will be discussed later.
- The teacher uses one search field rather than successive hierarchy/year filters. Search may match a subject, domain, subdomain, goal wording, clarification or code, but **only subdomains** appear as selectable search results.
- Remove the result-type badge because every selectable result is a subdomain. Keep domain/subject context, source group/route tag and the goal count.
- The teacher selects **one subdomain and its source group/route**, not individual goals. Every goal in that precise source selection must be checked automatically. A read-only goal preview may explain the scope.
- Backend draft/submission code must derive the complete goal membership from the published `goalSets` record; it must not accept an arbitrary subset of goal IDs from the browser. Snapshot all of those goals on submission. Group labels retain their source meaning; a phase or swimming group is not inferred to be a school year.

This replaces individual-goal checkbox selection in original step 3 and the selected-ID browser input in later steps. The full catalog hierarchy remains in Convex and is retained for provenance/future use.

## Hero and integration workflow

- The topic search is an autocomplete dropdown that expands with matching subdomains and closes after a choice.
- ~~Topic choice, PDF upload and the start/email steps belong in a compact panel in the hero.~~ Superseded by the chalkboard flow below.
- Merge completed PRs into main once checks pass; avoid leaving a growing stack of open feature branches. The setup and catalog PRs were merged on 2026-10-09.

## Chalkboard flow and visual identity (2026-10-09)

- The start page has one hero: title, intro and topic search on the left, the thinking-Krito illustration on the right. On small screens the illustration sits on top and the open search becomes fullscreen.
- Choosing a topic moves to `/materiaal`: one centred column with the green dotted chalkboard as the PDF drop zone and Krito standing in front of it. The email field and start button appear under the board once files are added.
- The results page is deliberately calmer than the rest of the site: a summary bar and one list row per goal, with the verdict icon on the left and the reasoning and evidence folded out per row. No filters. During rechecking, goals whose initial confidence was below 60 keep the loading icon until their independent Sol result is saved; all other results are shown as soon as the initial analysis finishes.
- ~~Brand assets live in `public/brand` and `public/illustrations`.~~ Superseded by the Groene pen identity below.

## Groene pen identity (2026-10-12)

- The mascot illustrations felt made for children rather than teachers. After comparing five directions, the owner chose **Groene pen**: a cool grey desk, white paper sheets and Krito's voice in green pen (many Flemish schools correct in green). The homepage hero is a realistic lesson document annotated in the margin with Op.stap goal codes; there are no mascots or stock images.
- Type: Schibsted Grotesk for the interface, Carlito for anything quoted from a teacher's own document, Reenie Beanie only for short margin notes.
- The homepage combines the strongest sections of five refinements (2026-10-12): the annotated lesson hero; the context beside the two sourced quotes on one sheet; how it works as three before/after pairs; the example report with a key to the verdict marks; two cards for what Krito does and what it does not do (struck in red, with a pen note "jij beslist"); a price section on one punched notepad sheet: "Krito is gratis" first, then a personal note from the maker, Anton, with a photo placeholder. Don't claim "no account" (accounts are planned) or mention the school e-mail there; an FAQ accordion where one question is open at a time; a punched closing sheet. Every section is 128px apart on desktop (96px tablet, 72px phone).
- Verdict marks: a green tick (gedekt), a half-filled circle (gedeeltelijk gedekt), a red cross (niet gevonden) and a pencil question mark (onzeker). A goal still being checked shows a pen writing a short line. Hovering a result row circles its mark and tints the row.
- The homepage header is sticky and has a menu (Hoe werkt het?, Voorbeeld, Prijs and a button that opens the search). On small screens the links fold into a menu button; the search button stays visible beside it.
- The topic search never shows a loading state: it is usable immediately and the catalog loads in the background.
- Brand marks live in `src/components/brand.tsx`; all styles in `src/app/globals.css`. The chalk illustrations and old brand icons were removed. The favicon is a green pen tick (`src/app/icon.svg`).
- `/results/demo` and `/results/demo-loopt` show a fixed example of the results page, so the design can be checked without running an analysis.

## Homepage messaging (2026-10-09, revised 2026-10-12)

- The hero asks "Klopt je les nog met het nieuwe leerplan?" and says what Krito does: it reads the material a teacher already has and shows per goal what is in it and what is missing. The lesson sheet has no visible caption.
- The second section, "Te veel werk naast de klas", only names the problem (planlast, administratie, work in the evening) so teachers feel understood; it does not pitch Krito. Its quotes are verbatim, dated and linked to their source.
- Results will be e-mailed later, so don't claim they aren't.
- Price: "gratis" is the headline on its own line and is circled in green pen once, when it scrolls into view. On phones (≤900px) the three checkmark facts are hidden: "gratis" and its one line lead straight into the maker's note, which the owner wants leads to read (2026-10-13).
- The hero's pen marks start only when 65% of the lesson sheet is on screen, so phones that first show just its top still see the whole sheet being marked (2026-10-13). If 65% of the sheet can't fit on the screen (e.g. a phone in landscape), the marks are shown without animation.
- Below the hero: why (the workload problem, with sourced quotes), how it works, a live example of the results list with real Op.stap goals, what Krito does and does not do, FAQ and a closing call to action.
- Claims to avoid: anything about pupils reaching goals; "inspectieklaar" or proof for the inspectie (it asks for no extra documents); any affiliation with or endorsement by Katholiek Onderwijs Vlaanderen; calling per-year leerplandoelen "minimumdoelen" (those exist only at the end of the 3de kleuterklas, 4de and 6de leerjaar); "always up to date" or "approved" claims; unsourced time-saving numbers.
- Only school email addresses may start an analysis; consumer mailboxes are refused (`shared/emailPolicy.ts`).

## Search engines (2026-10-13)

- The production site (www.krito.be) is indexable; previews, local builds and every non-production Vercel build send `noindex` and a robots.txt that disallows everything (`src/lib/site.ts`, keyed on `VERCEL_ENV`).
- Indexable pages: the homepage and `/privacy`, both in the sitemap with a canonical on www.krito.be. The material step, results (including the demos) and the unsubscribe page are `noindex`. robots.txt doesn't block them, so crawlers can read that noindex.
- The homepage carries JSON-LD (WebSite, a free WebApplication for teachers, and the FAQ, generated from `src/content/home.ts`). The share card is `src/app/opengraph-image.tsx`, rendered at build time in the site's fonts.
- The illustration's headings in the hero sheet are styled paragraphs, so they stay out of the page outline (h1, then the h2 sections).

## E-mail and the pdf report (2026-10-12)

- The report e-mail delivers the analysis as a pdf; it is not a "your analysis is ready" notification. It has no link to the results, because results open only in the tab that started the analysis; accounts will solve that.
- The pdf is regenerated on demand and never stored. Page 1: overview, every goal with its verdict mark, the files. Then the breakdown per goal in catalog order.
- Welcome sequence for a new mailbox (via an analysis or the mobile link): +1 hour, +2 days, +3 days after e-mail 2. Only welcome 1 carries the photo of Anton and Charlotte; every e-mail is signed "Anton". A small grey notice under the e-mail field announces the three mails; each one has an unsubscribe link.
- E-mails are plain text with a plain-looking html twin. From `anton@mail.krito.be`, replies to `anton.verhasselt@gmail.com`. Open and click tracking is on.
- E-mail content lives in `emails/*.md`, one file per e-mail, instead of Resend templates. Our own Resend integration instead of `@convex-dev/resend`, whose queue cannot send attachments.
- On a phone, a card above the upload sends the teacher a link to the same topic; it starts no analysis and is rate-limited (3 per address per day, 100 in total per day).
- Accepted trade-off (review of PR #11): someone can type a colleague's school address in the mobile form, which also starts the welcome sequence for that address. The owner wants reminders to count as a first sign-up. Mitigations: the reminder says "Was jij dat niet? Negeer deze mail", every welcome e-mail has an unsubscribe link, the sequence starts once per mailbox and stops on a bounce or complaint. Revisit with a confirmation step if abuse shows up.

## Uploads and future accounts

- Accept multiple files, at most **20 files**, 10 MiB each and 40 MiB combined. Enforce all limits in the browser and backend.
- Accepted material (2026-10-09): PDF, Word (docx, doc, odt, rtf), PowerPoint (pptx, ppt, odp), spreadsheets (xlsx, xls, ods, csv) and plain text. Everything that is not a PDF is converted to PDF during upload validation by a self-hosted Gotenberg/LibreOffice service on Cloud Run in `europe-west1`, so citations, page links and slide images work the same for every file. Spreadsheets render one sheet per page; semicolon CSV and Windows-1252 text are normalised first. OpenAI could read docx/pptx directly, but only as text without images or page numbers, so it is not used for this.
- Store submitted email addresses in an application `users` table, with analyses referencing `userId`. Preserve the exact trimmed address, including plus tags and dots. Migration removes existing stored emails from analyses.
- These records remain `emailVerified: false` until verified authentication is implemented. An optional `authId` is reserved for the future Better Auth component identity. The current MVP still requires the private capability for every analysis/file operation; an email/profile link is not authorization.
- Better Auth and OTP are a later feature. The recommended application-table reference is documented by [Convex + Better Auth](https://labs.convex.dev/better-auth/migrations/migrate-to-0-9/migrate-userid/userid-in-app-table); verification requires the real [OTP flow](https://better-auth.com/docs/plugins/email-otp). Future account claiming must verify identity and the existing analysis capability rather than granting access from an unverified submitted address.

## Public launch (2026-10-14)

- Production runs on its own Convex deployment (Ireland), R2 bucket and converter. Data from the development phase is test data and was not migrated.
- E-mail is live for everyone in production; development stays on the allowlist.
- Teachers' uploads (as uploaded) and their analysed pdf copies are kept for one year, so they can be reused when the product grows; then R2 deletes them. Uploads that never reach an analysis are deleted after a day.
- No limit on the number of analyses. OpenAI usage is watched through PostHog and the OpenAI dashboard instead.
- The privacy page names the controller (YARU DAKE BV), the processors and their regions, the retention periods and how to exercise your rights.
