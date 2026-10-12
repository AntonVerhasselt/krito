# Plan: e-mail (Resend), pdf report and mobile hand-off

Status: **implemented on 2026-10-12** on the development deployment, with `EMAIL_MODE=allowlist`. Where the code differs from this proposal:

- The e-mail engine lives in `shared/email/` (`template.ts`, `content.generated.ts`), not `convex/emails/`.
- `convex.json` marks `@react-pdf/renderer` and `react` as external packages, because bundled react-pdf fails inside Convex.
- Page numbers are stamped with pdf-lib, because react-pdf's page-number callback doubles the render time.
- Open and click tracking must be enabled in the Resend dashboard; the API accepted the change but did not apply it.

Operations are described in `docs/setup.md` (section "E-mail (Resend) and the pdf report").
The e-mails are in [`/emails`](../../emails/README.md), one md file per e-mail. Screen text and research are in [`email-copy.md`](email-copy.md).

## 0. What we're building

| # | Feature | Trigger | Recipient sees |
|---|---|---|---|
| A | **Pdf report** of a finished analysis | — | Overview page plus a per-goal breakdown |
| B | **Download button** on the results page | Teacher clicks it | The pdf (A) in their downloads |
| C | **Report e-mail** | Analysis reaches `completed` | Plain e-mail with the pdf (A) attached. It delivers the report; it is not a "your analysis is done" notification |
| D | **Welcome sequence** (3 e-mails) | First time an address is entered (analysis or reminder) | E-mail 1 after 1 h (with the photo), e-mail 2 two days later, e-mail 3 three days after e-mail 2 |
| E | **Mobile hand-off** ("stuur dit naar mezelf") | Teacher on a phone, topic chosen, files not on the phone | A link that reopens this topic on their computer |
| F | **Tracking and logging** | All of the above | PostHog events, error capture, delivery status |

---

## 1. Decisions (each with a recommendation)

Items marked ✅ are decided (your stated preference or your answers on 2026-10-12). Items marked ❓ are still open.

### 1.1 Resend component vs our own Resend integration ✅ (decided: our own, thin)

What I found in the component's source (`get-convex/resend` 0.2.9):

- The normal `sendEmail` (queue, retries, batching) **cannot send attachments or inline images**. It posts to Resend's `/emails/batch`, which doesn't accept them.
- Attachments go through `sendEmailManually`, which calls the Resend SDK yourself, with **no queue and no retries**.
- Our two most important e-mails need that manual path: the report e-mail (pdf) and welcome e-mail 1 (the photo).
- The component stores the API key in plain text in its own tables (`lastOptions`, workpool job args), so it's visible in the Convex dashboard data.
- Its strengths (batching 100 e-mails per call, rate limiting) don't matter at our volume.

**Recommendation:** skip the component and build a small integration with the `resend` npm SDK:

- **One `emailMessages` table:** our ledger, idempotency and status store.
- **One `deliver` Node action:** sends through the SDK and retries itself through the Convex scheduler.
- **One webhook route:** updates delivery status.

That's one send path for every e-mail, attachments included. We need our own table anyway: idempotency per analysis, welcome-sequence state, linking webhook events to a user for bounces and unsubscribes. The extra code is about 150 lines: retry, backoff and webhook signature check.

If you prefer the component anyway, the install checklist is in [Appendix A](#appendix-a-convex-resend-component-checklist). The rest of this plan works either way: replace "`deliver` action" with "`resend.sendEmail` / `sendEmailManually`".

### 1.2 Store the pdf or regenerate it ✅ (regenerate, don't store)

I agree with your preference. Regenerate on every download and every e-mail; never write the pdf to R2 or Convex storage.

- **Data doesn't change:** after `completed` (`analysisGoals.finalResult` plus the topic snapshot), so the pdf is reproducible.
- **Nothing new to keep or delete:** no new retention rules, privacy text or bucket lifecycle. The R2 helper also refuses anything outside the dev bucket.
- **Cheap:** rendering takes about 1–3 s and costs nothing per render.

Accepted trade-offs:

1. If the pdf layout changes later, a fresh download will look different from the copy that was e-mailed.
2. If analyses get a retention limit one day, the pdf can no longer be regenerated after deletion. The e-mailed copy stays with the teacher.
3. The pdf prints "Analyse van {datum}" so two versions are easy to tell apart.

### 1.3 Pdf engine ❓ (recommendation: `@react-pdf/renderer` in a Convex Node action, after a half-day spike)

| Option | Pros | Cons |
|---|---|---|
| **`@react-pdf/renderer`** (recommended) | Flexbox layout, automatic page breaks, SVG for the verdict marks, custom fonts. Readable JSX we can keep in the Groene pen style | New dependency. Needs a spike to confirm it bundles in a Convex `"use node"` action and accepts embedded font bytes |
| `pdf-lib` + `@pdf-lib/fontkit` (fallback) | `pdf-lib` is already installed and used in `convex/node/` | Manual text wrapping and pagination; a lot of layout code |
| Chromium HTML→pdf (Gotenberg) | Pixel-perfect HTML | Needs the Chromium image of a converter that isn't even production-deployed yet. Slow and fragile |
| Browser `window.print()` | Free | Can't be used for the e-mail; output varies by browser |

Render on the **server** in both cases (download and e-mail), so the downloaded pdf and the e-mailed pdf are identical and the browser bundle stays small.

- **Fonts:** Schibsted Grotesk for body text, Reenie Beanie for one green-pen note, both OFL. Embed them as base64 modules generated once by a script, because Convex doesn't deploy loose asset files.
- **Why not the standard pdf fonts:** they're WinAnsi only and would crash on characters like `≤`, `½`, `→` or emoji in quotes.

### 1.4 Where the e-mail content lives ✅ (decided: one md file per e-mail in `/emails`)

Each e-mail is a Markdown file in [`/emails`](../../emails/README.md): frontmatter with the `subject`, then the body in plain text exactly as it's sent, with `{{variables}}`, `{{#if}}…{{else}}…{{/if}}` and a `{{photo}}` marker. That replaces Resend's template editor.

- **Why not Resend templates:**
  - They are HTML/visual-editor first.
  - They can't carry attachments in the same send, so the pdf and photo e-mails would be split across two systems.
  - The variants need logic anyway.
  - md files are versioned, reviewable in a PR, and the same in dev and prod.
- **How the md files reach Convex:** Convex can't import `.md` files at runtime. `npm run emails:build` (a new `scripts/buildEmails.ts`) therefore:
  1. Reads `emails/*.md`.
  2. Parses the frontmatter.
  3. Checks every `{{variable}}` against the allowed list for that e-mail (README table). It also checks that welcome e-mails contain `{{unsubscribeLink}}`, that `{{photo}}` appears only in welcome 1, and that every `{{#if}}` is closed.
  4. Writes `shared/email/content.generated.ts`, which is committed.
- **Staleness check:** a vitest test rebuilds in memory and fails when the generated file is out of date, so a forgotten build can't ship.
- **Renderer:** `shared/email/template.ts`, about 60 lines with no template-library dependency. It fills variables, resolves conditions, collapses doubled blank lines, and produces:
  - `text`: the body as written;
  - `html`: a plain-looking twin with `<p>` per paragraph, `<ul>` for `- ` lines, `<a>` for URLs, the photo as `<img src="cid:anton">`, and system font, nothing else.
- **`npm run emails:preview`** prints every e-mail and variant with sample data, including singular/plural edge cases. With `--send <address>`, it sends them to an allowlisted address for an inbox check.
- **Code supplies only the data:** counts, already-pluralised phrases (`3 bestanden` / `1 bestand`), links. Every word a teacher reads lives in the md files.

### 1.5 Welcome sequence: Convex scheduler vs Resend Automations ❓ (recommendation: Convex scheduler)

Resend launched Automations in April 2026 (event-triggered steps with delays). We'd still need:

- every contact copied to Resend;
- events pushed to it;
- templates (see 1.4);
- the stop rules re-implemented in their builder: unsubscribed, bounced, has done an analysis yet or not.

A chain in the Convex scheduler is simpler:

1. Step 1 is scheduled at +1 h.
2. When step N is sent, step N+1 is scheduled.
3. Each step checks the stop rules again just before sending.

It cancels cleanly, is testable, and keeps all state in our database.

### 1.6 "Plain text" and the photo ❓ (recommendation: plain text everywhere, plus a plain-looking HTML twin)

A real `text/plain` e-mail can't show an image. Proposal:

- **Write every e-mail as plain text.** Each e-mail also gets a generated HTML twin: the same text, the system font, no styling, no logo. Links become clickable and look the same everywhere. The HTML twin is also what makes open and click tracking possible (§1.6a).
- **Welcome e-mail 1 only:** the HTML twin shows the photo inline under "Anton" (`cid:` inline attachment, so Outlook doesn't block it as a remote image). The `text` part says nothing about a photo.
- **Photo file:** convert `public/anton.webp` to a JPEG (~600 px wide, under 80 KB), because Outlook desktop doesn't show WebP.
- **Signature:** every other e-mail is signed only "Anton". ✅

### 1.6a Open and click tracking ✅ (decided: on)

- **Turn on open and click tracking** for `mail.krito.be` in Resend (Domains → Configuration).
  - Opens use a 1×1 pixel in the HTML part.
  - Clicks rewrite the links in the HTML part through Resend's redirect. The plain-text part isn't tracked.
- **Webhook:** enable `email.opened` and `email.clicked`. We store the **first** open and the first click per message (`openedAt`, `clickedAt`) and send one PostHog event each. Repeats only bump a counter, so forwarded or re-read e-mails don't flood PostHog.
- **Read the numbers with care:**
  - **Apple Mail Privacy Protection** preloads images, so opens are inflated. Treat the open rate as a trend, not a fact.
  - **School mail scanners** (Microsoft Defender Safe Links, Google Workspace) open and click links in advance. A click within about 10 seconds of delivery is flagged `is_bot_suspected=true`, and the dashboards exclude it.
  - For "did it work", the best signal remains whether the teacher starts an analysis afterwards (`email_link_opened` → `analysis_submitted`, §8).
- **The unsubscribe link is click-tracked too.** That's harmless, because the page asks for a button press (§1.9). The `List-Unsubscribe` header isn't rewritten.
- **Deliverability:** tracked links point to Resend's tracking domain. If Resend allows a custom tracking subdomain such as `links.mail.krito.be`, use it; otherwise accept the default. Keep an eye on the bounce and complaint rate in the first weeks.
- **Privacy text:** the privacy page states that we see whether an e-mail is opened and whether a link is clicked (draft in `email-copy.md` §1.6).

### 1.7 Link to results in the report e-mail ❓ (recommendation: no link in v1)

Results open only with the access key stored in the tab where the analysis started. The server keeps only its hash, so it can't build a working link.

- **Adding a link would mean a server-issued key:** for example `/results/{id}#k=…`, with an expiry and a new security review.
- **The pdf already covers it:** it's the durable copy, which is exactly what you asked for.
- **Accounts will solve it properly:** with the planned Better Auth login, the e-mail can simply point to "je analyses".

The report e-mail therefore has no results link.

### 1.8 Sender, replies and domain ✅ (decided)

- **From:** `Anton van Krito <anton@mail.krito.be>` for every e-mail.
- **Reply-To:** `anton.verhasselt@gmail.com` for **every** e-mail (report, reminder and welcome), until a proper krito.be inbox exists. It's an env var (`EMAIL_REPLY_TO`), so switching later needs no code change.
  - Recipients will see the Gmail address when they reply. That's fine for a founder writing personally.
- **Verify `mail.krito.be` in Resend in the EU region (`eu-west-1`):** SPF and DKIM records on the subdomain, plus a DMARC record (`p=none` to start). DNS changes are needed at the krito.be DNS provider.
  - A subdomain keeps the sending reputation separate from the root domain, as Resend recommends.
- **Resend plan:** the free plan allows **100 e-mails/day** and 3,000/month, with 1 webhook endpoint.
  - Each new teacher gets about 4 e-mails within 5 days (report, then welcome 1–3).
  - A good day of 30 new teachers plus their reports already reaches the daily cap.
  - **Recommendation:** start on free, move to Pro ($20/month, no daily cap) before the first real push. A PostHog alert on `email_message_failed` with `error_code=quota_exceeded` will tell you when.

### 1.9 Consent and unsubscribe ✅ (decided: a small notice at sign-up + unsubscribe in every welcome e-mail; not legal advice)

- **Report e-mail and reminder link:** the teacher asked for these. They're transactional, so no opt-in and no unsubscribe link.
- **Welcome sequence:** a **small notice** in grey under the e-mail field in both modals (analysis and mobile). No checkbox. It's not presented as a big deal:
  > Je krijgt ook drie korte mails van mij over hoe Krito werkt. Uitschrijven kan altijd. — Anton

  Each welcome e-mail also carries the unsubscribe link.
- **Background (from the research, §2 of `email-copy.md`):**
  - FOD Economie treats a named work address (`juf.an@school.be`) as a natural person's address, so it isn't exempt from the spam rules.
  - The APD's 2026 recommendation requires prior consent for e-mail *advertising*, with a narrow soft opt-in exception. Whether that exception covers a free tool is uncertain (CJEU *Inteligo*, Nov 2025).
  - The same APD recommendation separates *service information* from promotion.
- **Mitigation:**
  - The notice informs people when their address is collected, and every e-mail has an easy, free opt-out.
  - The welcome e-mails stay about *using the service the teacher just used*.
  - The one promotional line, "vertel het aan een collega" in `emails/welcome-3.md`, can be deleted from the file if you want to be stricter.
- **Unsubscribe mechanics:**
  1. Every welcome e-mail ends with an unsubscribe link. It also gets the `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers.
  2. **Unsubscribe page `/uitschrijven?t=…` shows a button instead of unsubscribing on GET.** School mail filters (Microsoft Defender Safe Links) open every link in advance. A one-click GET would unsubscribe people automatically.
  3. The one-click header points to a Convex HTTP `POST` route.
  4. Update the privacy page with an e-mail section (draft in `email-copy.md` §1.6). It names Resend as the sending service, says the pdf contains file names and quotes, and mentions open and click tracking.
- **Remove existing copy that promises results only on the website:**
  - `EmailGate.tsx:64-67`
  - the FAQ answer in `Home.tsx:101-102`
  - `privacy/page.tsx`
  - `docs/specification.md:5,358`
  - `docs/analysis-workflow.md:67`
  - README ("No … PDF reports, or email delivery")

### 1.10 Abuse protection ✅ (required)

The mobile reminder adds a **public endpoint that sends e-mail to any school address** without an upload. That makes it a spam and harassment vector, and it would also enrol the victim in the welcome sequence. Add the Convex rate limiter component (`@convex-dev/rate-limiter`):

| Limit | Value (proposal) |
|---|---|
| Reminders per address | 3 / 24 h |
| Reminders per browser journey (`journey_id`) | 5 / h |
| Reminders globally | 150 / day (also protects the Resend quota) |
| Welcome sequences per address | Once, ever. Compare in lowercase, because `users.email` is stored as typed and `Juf@School.be` ≠ `juf@school.be` today |

Also apply:

- the personal-domain block and the server-side format check;
- suppression after a hard bounce or a complaint (§5).

Both e-mail types also say "Was jij dat niet? Negeer deze mail dan."

---

## 2. Pdf report (A)

### 2.1 Structure

**Page 1: overview.** You asked for "everything at a glance".

1. Header: the Krito wordmark (green pen tick) and "Verslag".
2. Title block, the same data as `ResultsHeading`:
   - topic path (vak › domein › subdomein)
   - topic title
   - group/leerjaar with route code
   - "{n} leerdoelen · {n} bestanden · Op.stap v1.3"
   - "Analyse van {completedAt, dd-mm-jjjj}"
3. Summary, mirroring the `Summary` component:
   - the stacked bar
   - counts per verdict: Gedekt / Gedeeltelijk gedekt / Niet gevonden / Onzeker
   - "{n} om zelf na te kijken"
4. **Checklist of every goal**, one compact row each: verdict mark (same SVG marks as the site), code, wording (9 pt), verdict label and a "Kijk zelf na" pen note where relevant.
   - Fits on page 1 for nearly every topic. Goals per topic: median 3, p90 12, p99 58, max 268.
   - Longer lists continue on page 2 under "Overzicht (vervolg)" before the breakdown starts.
5. Files analysed: name, page count, size. These come from `analyses.manifest`.
6. A short note: "Krito beoordeelt of je lesmateriaal een leerdoel ondersteunt, niet of leerlingen het beheersen. Citaten zijn door een AI-model gekozen; controleer ze in je eigen bestand."

**From page 2: breakdown, one block per goal**, in the same order as the checklist. Each block:

- Code + wording, verdict mark + label, "Zekerheid van beoordeling: 82/100"
- **Beoordeling:** explanation + confidence reason
- **Wat ontbreekt:** `missingRequirements` as a list
- **Bewijs uit je materiaal:** per item, file name · pagina N, then the quote (text) or the description (visual). With no evidence: "Er werd geen passage in je materiaal gevonden voor dit doel."
- A review note when `needsReview`, using the existing wording: "Kijk zelf na" / "opnieuw gecontroleerd"
- "Officiële bron: {sourceUrl}"

Each goal heading stays on the same page as its first lines.

**Every page:** footer "Krito · {topic} · {group}" and "pagina x van y".

**File name:** `Krito - {topic} {group} - {jjjj-mm-dd}.pdf`, with unsafe characters stripped.

✅ **Order of the breakdown:** catalog order, the same as the site and the page-1 checklist.

❓ **Official clarification ("toelichting"):** it can be long. I'd include only the source link and leave out the full text, which keeps the pdf short.

### 2.2 Code

- `shared/report/model.ts`: a pure function `buildReportModel(results)` that turns `getResults`-shaped data into a flat view model (counts, rows, sorted evidence, labels). Unit-tested.
- `convex/node/report.tsx` (`"use node"`): `renderReportPdf(model) → Uint8Array`, using `@react-pdf/renderer`. Fonts are imported from `convex/node/reportFonts.ts` (generated base64).
- `convex/reports.ts`:
  - `internal.reports.loadForReport` (internal query): authorises with `access.ts` (or takes an internal analysis id), requires `status === "completed"` and returns the data.
  - `api.reports.download` (public **action**): args `{ analysisId, accessToken }`. Returns `{ fileName, bytes: v.bytes() }`; a 1–3 MB pdf is well within Convex's return-value limit.
- **Results page:**
  - A "Download als pdf" button in `ResultsHeading` (`src/components/AnalysisResults.tsx:31-64`), shown only when `status === "completed"`.
  - The action's bytes become a Blob and are downloaded with `<a download>`. Busy label: "Pdf maken…".
  - The demo results page reuses the same model and renderer, for a sample download. Optional.
- **Spike first (half a day):**
  1. Render a 268-goal topic with real data from a Convex action.
  2. Check the bundle size and cold-start time.
  3. Check that `pdftotext` finds every goal code.
  4. If it fails, switch to the pdf-lib + fontkit fallback.

---

## 3. Report e-mail (C)

- **Trigger:** `convex/workflow.ts` `advance()`, the completion patch at `:306-310`. In the same mutation, after `analysis_completed`, call `enqueueEmail(ctx, { kind: "report", analysisId, userId })`.
- **Skipped** for `analysis.testMode` and `analysis.fixture`.
- **Idempotent:** `dedupeKey = "report:{analysisId}"`. A completed analysis can't be retried, so the analysis id is enough.
- **The `deliver` action:**
  1. Loads the data.
  2. Renders `emails/report.md` with the analysis data.
  3. Renders the pdf.
  4. Attaches it as `application/pdf`.
- **Failed analyses get no e-mail.** ❓ We could add a short "dit lukte niet" e-mail later. I'd wait.
- **For a first-time address:** the report e-mail arrives first. Welcome e-mail 1 follows about an hour after the address was entered, so it lands after the report, and its copy is written for that order.

---

## 4. Welcome sequence (D)

**Trigger:** `resolveContact()` returns `created: true` (`convex/users.ts:8-21`). That happens in `analyses.submit` (`convex/analyses.ts:208`) or in the new `reminders.request`.

- Call `startWelcome(ctx, userId, source: "analysis" | "reminder")`. It does nothing if:
  - any user with the same lowercased e-mail already has `welcome`; or
  - the user is suppressed or unsubscribed.
- **Existing users are not back-filled.**

| Step | When | Variant chosen *at send time* |
|---|---|---|
| 1 | entry + 1 h | **A**: has a completed analysis → "Klopte het?" · **B**: no analysis yet → "Waarom wilde je Krito proberen?" |
| 2 | step 1 sent + 2 days | **A**: how to read your report · **B**: start with one worksheet + the reminder link |
| 3 | step 2 sent + 3 days | Single version: "Wat ontbreekt er nog?" |

**Stop rules, checked just before every step:**

- unsubscribed;
- hard bounce or complaint;
- the user has been deleted.

When a step stops, the rest is cancelled and the reason is recorded.

❓ **Quiet hours:** if +1 h falls between 21:00 and 07:00 Brussels time, should welcome 1 wait until 07:30? You asked for exactly +1 h, so that's the default. Teachers often work in the evening, so I'd keep it.

---

## 5. Sending infrastructure (shared by C, D and E)

### 5.1 Data model (`convex/schema.ts`)

```ts
emailMessages: defineTable({
  userId: v.id("users"),
  kind: v.union(v.literal("report"), v.literal("reminder"), v.literal("welcome")),
  step: v.optional(v.number()),            // welcome 1..3
  variant: v.optional(v.string()),          // "A" | "B", set at send time
  analysisId: v.optional(v.id("analyses")), // report
  goalSet: v.optional(v.object({ catalogVersion: v.string(), key: v.string() })), // reminder
  dedupeKey: v.string(),                    // "report:<id>", "welcome:<userId>:1", "reminder:<uuid>"
  status: v.union(/* scheduled | sending | sent | delivered | delivery_delayed
                     | bounced | complained | failed | cancelled | skipped */),
  sendAt: v.number(),
  scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
  providerId: v.optional(v.string()),       // Resend email id
  openedAt: v.optional(v.number()), openCount: v.optional(v.number()),   // first open + repeats
  clickedAt: v.optional(v.number()), clickCount: v.optional(v.number()), // first click + repeats
  attempts: v.number(),
  errorCode: v.optional(v.string()),        // safe code only
  analyticsContext: v.optional(analyticsContext), // copied from the originating analysis/reminder
  createdAt: v.number(), sentAt: v.optional(v.number()), updatedAt: v.number(),
}).index("by_dedupe", ["dedupeKey"]).index("by_provider", ["providerId"])
  .index("by_user", ["userId", "createdAt"]).index("by_status_send", ["status", "sendAt"]),
```

`users` gets new fields:

- `emailKey` (lowercased, for dedupe; with a migration)
- `welcome?: { status, source, startedAt, stoppedReason? }`
- `emailUnsubscribedAt?`
- `emailSuppressedAt?`, `emailSuppressedReason?`

The body text isn't stored: it's rebuilt from `emails/*.md` (via `content.generated.ts`) and stored data. The `emailMessages` rows hold no content, only metadata.

### 5.2 Flow

```text
mutation (submit / advance / reminders.request)
  └─ enqueueEmail(): insert emailMessages (dedupe) + scheduler.runAt(sendAt, internal.emailDelivery.deliver)
deliver (Node action)
  ├─ load message + user + data (internal query)
  ├─ gate: EMAIL_MODE, suppressed, unsubscribed (welcome), stop rules → mark skipped/cancelled
  ├─ render { subject, text, html } from content.generated.ts (emails/*.md) + attachments (pdf / photo)
  ├─ resend.emails.send({... , headers: { "Idempotency-Key": messageId, List-Unsubscribe… } })
  ├─ ok → markSent(providerId) (+ schedule next welcome step)
  └─ error → 429/5xx/network: reschedule with backoff 30 s, 2 min, 10 min, 1 h, 6 h (max 5)
             other 4xx: mark failed + captureAnalysisException
```

### 5.3 Modes and safety

`EMAIL_MODE` is set per Convex deployment:

| Mode | Behaviour |
|---|---|
| `off` | Nothing is sent. Messages are marked `skipped` with the code `email_disabled` |
| `allowlist` | Only addresses in `EMAIL_ALLOWLIST` (comma-separated) receive mail; everything else is `skipped`. Use this while testing |
| `live` | Everything is sent |

> The live site still runs on the **development** Convex deployment, so "dev" is effectively production. Keep `EMAIL_MODE=allowlist` until the copy is approved and the domain is verified.

### 5.4 Webhook

- **Route:** `convex/http.ts` (new) handles `POST /resend-webhook`.
  1. Verifies the Svix signature with `RESEND_WEBHOOK_SECRET`, through the Resend SDK's webhook verify or the `svix` package.
  2. Finds the message `by_provider`.
  3. Moves its status forward only, never back.
- **Resend endpoint:** `https://<deployment>.convex.site/resend-webhook`.
- **Events to enable:** `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`, `email.opened`, `email.clicked`.
- **Opens and clicks:** set `openedAt` / `clickedAt` the first time and increment `openCount` / `clickCount` after that. They never change the delivery status.
- **A hard bounce, complaint or suppression** sets `users.emailSuppressedAt` and stops the welcome sequence.
- **Unsubscribe:** the one-click `POST /unsubscribe` is in the same `http.ts`.

### 5.5 Logging

`convex/` has no `console.*` today. Add a tiny `log(operation, code, ids)` helper for the e-mail and report actions so failures show in the Convex logs. Its rules:

- it logs only the message id, analysis id and safe codes;
- never addresses, file names or text.

Errors also go to PostHog error tracking through `captureAnalysisException` (§8).

---

## 6. Mobile hand-off (E)

**Where:** `src/components/MaterialStep.tsx`, between the heading block (`:160`) and `<UploadPanel>` (`:187`). It's a new `SendToSelf` card.

- **Shown on phones only:** CSS `@media (max-width: 900px)`, the same breakpoint where the upload layout collapses to one column (`globals.css:3109`). Hidden on desktop.
- **The upload area stays below it, unchanged.** Photographing paper worksheets on the phone is a real use case.
- **Visual:** a punched-notepad sheet (owner preference) with a pen note, so it reads clearly as the main action on mobile.

**Modal:** reuse `Modal` and generalise `EmailGate` into a shared `SchoolEmailForm`, which holds:

- the label, placeholder and `type=email`;
- the `isPersonalEmail` check;
- error mapping through `safeError`;
- typing and validation tracking.

`EmailGate` (analysis) and `SendToSelfGate` (reminder) only set the title, lead text, button and submit handler. The reminder modal must make clear that **no analysis starts**; the screen text is in `email-copy.md` §1.4. On success it shows a "Verstuurd" state in the modal.

**Backend:**

- **`shared/emailPolicy.ts`:** add `validateSchoolEmail()`. It is the trim + 254 + regex + personal check that today sits inline in `analyses.submit:138-141`. Both mutations use it.
- **`convex/reminders.ts` → `request({ email, catalogVersion, goalSetKey, analyticsContext })`** (public mutation):
  1. Validates the e-mail and the topic (`chosenTopic`).
  2. Applies the rate limits (§1.10).
  3. Calls `resolveContact`, and `startWelcome(…, "reminder")` if the address is new.
  4. Calls `enqueueEmail({ kind: "reminder", goalSet })`.
- **Deep link:** `{SITE_URL}/materiaal?onderwerp={goalSetKey}&versie={catalogVersion}&via=herinnering`.
  - `MaterialStep` (or a small hook) reads the params and selects the topic. It reuses the draft-handling logic from `TopicPicker.choose`, extracted into a shared hook.
  - It then strips the params with `history.replaceState`.
  - The link carries no personal data and no token, because a topic is public.

---

## 7. Environment variables

| Variable | Where | Secret | Value / source |
|---|---|---|---|
| `RESEND_API_KEY` | Convex | yes | ✅ already set on dev. Resend → API Keys, "Sending access" scoped to krito.be |
| `RESEND_WEBHOOK_SECRET` | Convex | yes | Resend → Webhooks → endpoint → signing secret (`whsec_…`) |
| `EMAIL_MODE` | Convex | no | `off` / `allowlist` / `live` |
| `EMAIL_ALLOWLIST` | Convex | no | e.g. your own address, `delivered@resend.dev` (allowlist mode only) |
| `EMAIL_FROM` | Convex | no | `Anton van Krito <anton@mail.krito.be>` |
| `EMAIL_REPLY_TO` | Convex | no | `anton.verhasselt@gmail.com` (for now; all e-mails) |
| `EMAIL_LINK_SECRET` | Convex | yes | 32 random bytes (`openssl rand -hex 32`), used to sign unsubscribe links |
| `SITE_URL` | Convex | no | `https://www.krito.be`, for the reminder link and the unsubscribe link |
| `WELCOME_DELAY_SCALE` | Convex (optional) | no | Testing only. For example `0.001` turns 1 h / 2 d / 3 d into seconds and minutes. Ignored when `EMAIL_MODE=live` |

Nothing new goes to Vercel. Files that need updating:

- `scripts/checkEnvironment.ts`: the required list (line 6)
- `scripts/setBackendEnvironment.ts`: secrets → `required`, plain values → `payload`
- `.env.example:19-26`
- `docs/setup.md`: a new "E-mail (Resend)" section using the converter table format
- `shared/buildEnvironment.ts:55-57`: refuse `RESEND_API_KEY` and `EMAIL_LINK_SECRET` on Vercel, like the OpenAI and R2 keys

---

## 8. PostHog tracking

These follow the existing conventions (`docs/analytics.md`, `shared/analytics.ts`): `object_pastverb` names, snake_case properties, allowlisted properties, consent-gated, no addresses or text.

**Consent problem and solution:** backend events need an `analyticsContext`, which today only exists on `analyses`. Each `emailMessages` row therefore stores a **copy of the context from the request that caused it**: the analysis for report and welcome-via-analysis, the reminder request for reminder and welcome-via-reminder. Then each e-mail event is consent-gated like every other backend event.

### Browser events

| Event | Properties |
|---|---|
| `report_download_clicked` | `analysis_id`, `goal_count` |
| `report_download_completed` | `analysis_id`, `bytes`, `duration_ms` |
| `report_download_failed` | `analysis_id`, `error_code` |
| `reminder_prompt_viewed` (`trackOnce` per topic, only when the card is actually visible) | `subject_key`, `group_key` |
| `reminder_gate_opened` / `reminder_gate_closed` | `subject_key`, `reason` |
| `reminder_submit_requested` / `reminder_submit_failed` | `subject_key`, `error_code` |
| reuse `email_typing_started`, `email_validation_failed` | add `source: "analysis" \| "reminder"` |
| `email_link_opened` (landing with `?via=`, then the param is stripped) | `email_kind`, `sequence_step`, `subject_key` |

### Backend events

| Event | Properties |
|---|---|
| `report_generated` / `report_generation_failed` | `analysis_id`, `source: "download" \| "email"`, `page_count`, `bytes`, `duration_ms`, `error_code` |
| `reminder_requested` | `subject_key`, `group_key`, `had_input` (= existing user) |
| `email_message_queued` / `_sent` / `_delivered` / `_delivery_delayed` / `_bounced` / `_complained` / `_failed` / `_skipped` | `email_kind`, `sequence_step`, `email_variant`, `attempt`, `error_code`, `reason` |
| `email_message_opened` / `email_message_clicked` (first time per message only) | `email_kind`, `sequence_step`, `email_variant`, `duration_ms` (time since delivery), `is_bot_suspected` (click < ~10 s after delivery). The clicked URL is **not** sent; the property filter would drop it anyway |
| `welcome_sequence_started` / `_completed` / `_stopped` | `source`, `reason` |
| `email_unsubscribed` | `email_kind`, `sequence_step` |

**Changes in `shared/analytics.ts`:**

- New properties: `email_kind`, `sequence_step`, `email_variant`, `is_bot_suspected`.
- New `safeCodes`: `rate_limited`, `email_disabled`, `email_suppressed`, `quota_exceeded`, `email_provider_error`, `report_render_failed`.
- `routePattern`: add `/uitschrijven`.
- `beforeSend` must already strip `via`/`onderwerp` query params from URLs. A test confirms it.

**`scripts/configurePosthog.ts`:**

- add event descriptions;
- add a new **"Krito · E-mail"** dashboard with three views:
  1. Mobile hand-off funnel: `reminder_prompt_viewed → reminder_gate_opened → reminder_requested → email_link_opened → analysis_submitted`.
  2. Welcome sequence per step and variant: delivered → opened → clicked (excluding `is_bot_suspected`) → `analysis_submitted` within 7 days.
  3. Deliverability: bounced, complained, failed and quota errors.
- add a report-downloads insight on the Activation dashboard.

**Tests:**

- `tests/analytics.test.ts` and `tests/backendAnalytics.test.ts`: new properties pass; addresses and Resend ids never pass.
- The welcome and e-mail events respect missing consent.

---

## 9. Implementation phases

Each phase is its own PR, and each is shippable.

1. **Foundation**
   - `emails/*.md` → `scripts/buildEmails.ts` → `shared/email/content.generated.ts` + `render.ts` + `emails:preview`
   - `resend` SDK
   - `emailMessages` + `users` fields + migration
   - `enqueueEmail` / `deliver` / backoff
   - `EMAIL_MODE`
   - `http.ts` webhook
   - env scripts and docs
   - rate limiter component
   - a smoke script that sends one test e-mail
2. **Pdf report + download button:** spike → `shared/report/model.ts` → renderer → `reports.download` → button + tracking.
3. **Report e-mail:** the hook in `advance()`, `emails/report.md`, the attachment, the copy changes in EmailGate, FAQ and privacy.
4. **Welcome sequence + unsubscribe:** the scheduler chain, variants, stop rules, the photo inline, the `/uitschrijven` page + one-click POST.
5. **Mobile hand-off:** the shared form, the `SendToSelf` card + modal, `reminders.request`, the deep link, `email_link_opened`.
6. **Analytics dashboards + go-live:** domain verified → Pro plan? → `EMAIL_MODE=live`.

---

## 10. Verification

**Automated** (`npm test`, `npm run typecheck`, `npm run lint`):

- **E-mail md files:**
  - the generated file is up to date;
  - unknown variables fail;
  - unclosed `{{#if}}` fails;
  - `{{photo}}` only in welcome 1;
  - `{{unsubscribeLink}}` required in every welcome file;
  - snapshots of rendered text and HTML per e-mail and variant, with singular/plural, zero counts, and no `undefined` or `{{` left in the output.
- **Tracking webhook:** only the first `opened`/`clicked` sends a PostHog event; a click within 10 s of delivery gets `is_bot_suspected`.
- **`buildReportModel`:** counts, order, missing evidence.
- **Pdf:** render the magnetism demo fixture and a synthetic 268-goal fixture. Check that the output starts with `%PDF` and that `pdftotext` contains every goal code and every quote. Check that a quote with `≤ ½ → 😀` doesn't crash.
- **`validateSchoolEmail`:** shared tests, reusing `tests/emailPolicy.test.ts`.
- **Webhook:** an invalid signature returns 400 or 401; a valid event moves the status; a status never goes back; a bounce suppresses the user and stops the welcome sequence.
- **Welcome sequence:** times +1 h / +2 d / +3 d, variant choice, stops when unsubscribed, never twice for `Juf@School.be` and `juf@school.be`.
- **Rate limits:** the 4th reminder within 24 h is refused with `rate_limited`.
- **Playwright with an iPhone viewport:**
  - the card is visible above the drop zone, and hidden at a desktop width;
  - the modal refuses a Gmail address;
  - after success it shows "Verstuurd".
- **AGENTS.md:** this work doesn't touch conversion. Run `npm run test:converter` anyway if anything in `convex/node/` that the converter uses changes.

**Manual, before `EMAIL_MODE=live`:**

1. Resend shows `mail.krito.be` as **Verified**: SPF, DKIM, and a DMARC record present. Open and click tracking are enabled for the domain.
2. With `EMAIL_MODE=allowlist` and your address on the list:
   - run an analysis → the report e-mail with the pdf arrives;
   - welcome 1 arrives about an hour later with the photo inline.
   - Set `WELCOME_DELAY_SCALE=0.001` to see steps 2 and 3 arrive within minutes.
3. Check the photo and line breaks in **Gmail web, Outlook (desktop + web), Apple Mail and Gmail on iPhone**.
   - Open one e-mail and click its link: `openedAt` and `clickedAt` are set on the message, and `email_message_opened` and `email_message_clicked` appear once each in PostHog.
   - Check that the tracked links still lead to the right page.
   - Edit a sentence in an `emails/*.md` file, run `npm run emails:build` and `npm run emails:preview`, and check the change shows up.
4. Send to `bounced@resend.dev` → the user is suppressed and the sequence stops. Send to `complained@resend.dev` → the same.
5. In the e-mail headers ("Show original"), confirm `spf=pass dkim=pass dmarc=pass`. Score at mail-tester.com; aim for at least 9/10.
6. Open the unsubscribe link: it shows the button page and does **not** unsubscribe until you click.
7. On a phone: choose a topic → the card is visible → send the link → open it on the computer → the topic is preselected → start an analysis.
8. PostHog Live events: every new event appears, consent is respected, and no address or file name shows in the properties.
9. Download the pdf from the results page. Compare it with the e-mailed copy; they should be identical.

---

## 11. Decisions log and open questions

Decided on 2026-10-12:

- Our own thin Resend integration, not the component (§1.1).
- Breakdown in catalog order (§2.1).
- Sending from `anton@mail.krito.be`, with replies to `anton.verhasselt@gmail.com` for every e-mail (§1.8).
- A small notice under the e-mail field, plus an unsubscribe link in every welcome e-mail (§1.9).
- Open and click tracking on (§1.6a).
- E-mail content as one md file per e-mail in `/emails`, compiled at build time (§1.4).

Still open, with defaults I'll use unless you say otherwise:

1. `@react-pdf/renderer` after a spike, with pdf-lib as the fallback (§1.3). *Default: yes.*
2. The welcome sequence on the Convex scheduler, not Resend Automations (§1.5). *Default: yes.*
3. Official clarification text in the pdf (§2.1). *Default: source link only.*
4. Free Resend plan now, Pro before the first push (§1.8). *Default: yes.*
5. Quiet hours for welcome e-mail 1 (§4). *Default: none, exactly +1 h.*
6. A "dit lukte niet" e-mail for failed analyses (§3). *Default: later.*
7. Whether the research facts go into the welcome e-mails (`email-copy.md` §2). *Default: only the Klasse quote in `emails/welcome-2-no-analysis.md`.*

---

## Appendix A: Convex Resend component checklist

Only applies if you choose the component (§1.1).

1. `npm install @convex-dev/resend`. Peer dependencies: `convex ^1.43` (we have 1.46) and `convex-helpers ^0.1.106`; install it if npm asks.
2. `convex/convex.config.ts`: `import resend from "@convex-dev/resend/convex.config.js"; app.use(resend);` next to the PostHog component.
3. `convex/sendEmails.ts`:

   ```ts
   export const resend = new Resend(components.resend, {
     testMode: false, // default true: only allows delivered|bounced|complained@resend.dev
     onEmailEvent: internal.emailEvents.handle,
   });
   ```

4. Sending:
   - Plain e-mails: `resend.sendEmail(ctx, { from, to, subject, text, html?, replyTo: [..], headers: [{name, value}], idempotencyKey })` from a mutation, which is transactional.
   - E-mails with attachments (report pdf, welcome photo): `resend.sendEmailManually(ctx, { from, to, subject }, async (emailId) => resendSdk.emails.send({ …, attachments, headers: { "Idempotency-Key": emailId } }))`. This path has no retries, so add our own.
5. Scheduling: the component has none. Use `ctx.scheduler.runAt` to call a mutation that enqueues.
6. `convex/http.ts`: route `POST /resend-webhook` → `resend.handleResendEventWebhook(ctx, req)`.
   - Enable only these 8 events: sent, delivered, delivery_delayed, bounced, complained, failed, opened, clicked. The component logs and ignores `scheduled`, `suppressed` and `received`.
   - Callback args: `vOnEmailEventArgs`.
7. Env vars: `RESEND_API_KEY` (✅ set) and `RESEND_WEBHOOK_SECRET`. Plus our own `EMAIL_FROM`, `EMAIL_REPLY_TO`, `SITE_URL` and `EMAIL_LINK_SECRET`.
8. Crons: `cleanupOldEmails` (7 days, finalised) and `cleanupAbandonedEmails` (30 days) every hour, via `components.resend.lib.*`.
9. Verification:
   - test mode to `delivered@resend.dev` → `resend.status(ctx, id)` moves from `queued` to `sent` to `delivered`;
   - the `emails` and `deliveryEvents` tables of the `resend` component in the Convex dashboard;
   - Replay in the Resend webhook page → a new `deliveryEvents` row.
10. Known caveats:
    - the API key is stored in plain text in the component's tables;
    - the component has its own fixed throttle of 1 call per 600 ms.
