# Development analysis workflow

The development MVP implements specification steps 1–10 with the accepted changes in [product-decisions.md](product-decisions.md). Production launch and Better Auth/OTP remain separate later work.

## Teacher flow

The hero contains one autocomplete for source subdomains, a private PDF uploader and an email gate. Choosing a subdomain/group selects every goal in that published set. There are no individual-goal checkboxes. The backend derives membership and snapshots the exact source wording, clarification and version at submission.

Upload at most 20 PDFs, 10 MiB each and 40 MiB combined. Files go directly from the browser to private development R2 through five-minute PUT URLs bound to `application/pdf`. Server validation checks actual size, PDF signature, strict parseability, encryption and page count. Upload state lives independently of rerenders; ready files and the topic reconnect after a same-tab refresh.

A browser-generated random 256-bit capability is stored only in session storage. Convex stores its SHA-256 hash. Every status/result/draft/file operation checks that capability. Public responses exclude email, hashes, object keys, provider IDs and permanent/signed file URLs. On-demand citation links expire after two minutes. The MVP does not promise retrieval in a different browser or email delivery.

Submitted addresses live in `users`, with `emailVerified: false` and optional future `authId`; analyses reference `userId`. These profile links do not authorize access. `scripts/migrateEmails.ts` idempotently moves legacy addresses without printing them. An optional legacy schema field remains for that migration only; submission no longer writes it.

## Persistent processing

`draft → queued → preparing → checking → rechecking → completed`, skipping rechecking when unnecessary. Initial failure produces `failed` with a safe message and explicit retry. Submission is one transaction, with snapshots, fixed manifest and scheduler entry. Duplicate submission returns the same job.

Preparation conditionally copies the validated staging object to a unique internal sealed key, then checks its bytes/hash/page count. No browser PUT is issued for sealed keys. Overwriting an earlier staging URL cannot change submitted evidence. Files are read individually with bounded streams; PDF bytes never enter Convex tables.

One `gpt-6-luna` background Responses generation receives every saved goal and every sealed PDF. Only confidence **below 60** creates sequential, independent `gpt-6.1-sol` requests, one goal with all PDFs each. A successful recheck replaces its result wholesale; the original Luna result is retained. Low-confidence Sol results require review. An exhausted Sol failure preserves Luna and marks review, without discarding unrelated results.

Strict Zod/semantic validation rejects missing/extra/duplicate IDs, invalid confidence, foreign files, out-of-range pages and inconsistent coverage/evidence. Summary counts derive from persisted final rows. Citations are labelled model-generated; structural checks alone do not prove educational correctness.

Creation has no implicit SDK retries. Known IDs are polled, with a lease and bounded transport recovery. Confirmed transient or malformed-output failures retry at most twice with a new generation. A possibly accepted creation with no saved ID is interrupted, requiring explicit retry. Old attempts/generations cannot overwrite current results. A minute cron resumes stale jobs; file validation/preparation recovery is bounded. Validated stored Responses objects are deleted best-effort; this does not imply erasure of all provider retention.

R2's checked-in lifecycle expires `staging/` after one day. A matching hourly cron removes abandoned drafts after 24 hours of inactivity. Completed analyses remain available in their current browser session; no completed-document retention policy is invented here.

## Repeating checks

Use the pinned Node 24 runtime (for this machine, prefix with `mise exec node@24.21.0 --`). Keep one backend writer: `npx convex dev --once`. Frontend CI/Vercel never publishes Convex.

```bash
npm run goals:update
npm run infra:lifecycle
npm run infra:cors
npm run fixtures:magnetism
npm run workflow:smoke
npm run workflow:smoke -- --real
npm run test:e2e:dev
npx tsx scripts/inspectAnalysis.ts <analysis-id>
npm run lint
npm run typecheck
npm test
npm run build
```

The fixture generator writes a three-page magnetism lesson and four-page exercise/answer PDF to the desktop Downloads folder. It uses original Dutch lesson text and vector diagrams. The workflow smoke requires `qpdf` for a real password-protected fixture. Playwright needs Chromium, `http://localhost:3000` and the generated PDFs. It runs against the explicit development backend, never as an unauthenticated CI cloud test.

Only an authenticated internal CLI call may mark a particular unsubmitted draft as a deterministic fixture. No public parameter or global provider toggle enables mocking. Fixture cleanup removes only explicitly marked fixtures and their objects; it preserves unrelated/user analyses. Screenshots, traces and videos are disabled for the private flow; tokens and signed URLs are withheld from script output.

The real smoke verified one Luna generation for 11 goals and two PDFs, strict output, background polling, evidence pages, protected results and sealed-object stability. The reviewed magnetism run checked six goals using both generated PDFs: three covered and three partial, no rechecks because confidence was 94–99. All 11 quoted passages were found on their specified local PDF pages, and both saved hashes matched the originals. The partial results correctly identified missing Earth-field explanations and the required compass experiment. That example's selected source group was 3de leerjaar; the source group is a teacher choice, independent of a PDF's target-age label.

Deterministic tests cover confidence 88/59/60/35, two independent recheck scopes, one bounded failed recheck, preserved initial results, privacy, duplicate submission and changing a staging object after sealing. Desktop/mobile Playwright covers both generated PDFs, refresh before and during processing, final goal cards, review filters, unavailable capability and no horizontal overflow. Unit tests validate malformed output and stale generations. Development remains protected by Vercel authentication; update exact preview CORS origins after each Ready deployment.

After merging, `npm run infra:cors -- --apply-only` reads the checked-in rule, discovers only this project's Ready deployment origins and applies the exact realized policy from an ignored generated file. This avoids a new commit/deployment solely to record that deployment's own immutable hostname. The normal command still updates the tracked origin snapshot for review.
