# Setup record

Step 1 acceptance checks passed on 2026-10-09. Production backend launch remains deferred.

## Verified identities

- Git author: Anton Verhasselt, anton.verhasselt@gmail.com.
- GitHub: AntonVerhasselt; explicitly confirmed by the user.
- Vercel personal account: anton-personal; personal scope anton-personal-projects.
- Cloudflare personal account: Anton.verhasselt@gmail.com's Account,
  account ID 546e2c266bb5a2e5d81edac39a4982ef.
- Convex: personal team anton-verhasselt (ID 289626), project krito, cloud development
  deployment majestic-sturgeon-687, region Europe (Ireland).
  URL https://majestic-sturgeon-687.eu-west-1.convex.cloud.
- OpenAI: development project key supplied through protected input and installed on Convex only.
  Both exact model IDs passed PDF / strict output / background / retrieval smoke tests.

## Runtime and tools

- Node 24.21.0, npm 11.19.0 (local pinned runtime).
- Git 2.55.0; GitHub CLI 2.101.0.
- Next.js / create-next-app 16.4.0.
- Convex CLI 1.46.0; Vercel CLI 63.1.0; Wrangler 4.149.0.
- Exact npm dependency versions are reproducible through package-lock.json.

## One-time prerequisites

An OpenAI development project key and R2 bucket-scoped S3 application credentials
must be issued using the respective provider flow when they are unavailable.
Supply secrets through ignored protected files or interactive CLI input, never chat,
command history, Git, or frontend variables. Wrangler OAuth is not an R2 S3 key.

The requested model IDs remain gpt-6-luna and gpt-6.1-sol. Official model pages list
them, but actual project access and PDF / background / strict output support must
be established with a real smoke test before they are marked verified.

## Created resources and checks

- Public MIT repository: https://github.com/AntonVerhasselt/krito; origin matches,
  default branch main; initial commit 8e2a39e.
- Convex development only; no production deployment publication or credentials.
- R2 krito-pdfs-dev, location WEUR; public r2.dev access disabled, no custom domains.
- Vercel scope anton-personal-projects, project krito,
  project ID prj_S1tZeNtzv0ROP2PzGZC2UDhEN8hQ,
  organization ID team_bDutkisIwjYFw8uJh00nmVFJ.
- Vercel settings read back: Next.js, root null (repository root), npm ci,
  npx tsx scripts/buildVercel.ts, Node 24.x, preview deployments enabled,
  Git fork protection, ssoProtection.deploymentType=all.
- Both public frontend variables reconciled across Development, Preview, Production;
  no per-branch override, OpenAI key, R2 keys, or Convex deployment key on Vercel.
- Local desktop/mobile health check identifies development / setup-v1.
- Local browser PDF PUT/GET succeeds with byte-for-byte verification.
- GitHub Login Connection required a one-time account authentication flow; user
  completed it. Git integration now matches AntonVerhasselt/krito and main.

## Secret placement

`.env.local` retains Convex's selector and frontend variables. Vercel link also
adds an ignored VERCEL_OIDC_TOKEN. `.secrets/development.env` is mode 600 and stores
only local credential input; npm run env:backend installs the values on the exact
selected development deployment through stdin. All values stay out of Git/logs.

OpenAI response objects created by the smoke test were deleted after validation.
This does not claim deletion of all provider-side retention.

## Remaining step 1 verification

All specified setup checks passed. Clean install, lint, TypeScript, frontend build,
and six build-isolation tests pass. The Vercel hosted builder uses CLI 62.1.0
(provider-controlled), while the checked-in local CLI is 63.1.0; both use Node 24.21.0.

- Main 5a5e4c5: https://krito-bsvl5v517-anton-personal-projects.vercel.app (Ready).
- Main alias: https://krito-theta.vercel.app.
- PR #1: https://github.com/AntonVerhasselt/krito/pull/1; deployment link present,
  GitHub Actions and Vercel checks pass.
- First feature push ce224b8: https://krito-2omppkvca-anton-personal-projects.vercel.app (Ready).
- Second same-branch push f15be6f: https://krito-942pfun51-anton-personal-projects.vercel.app (Ready).
- Stable branch: https://krito-git-feat-setup-preview-check-anton-personal-projects.vercel.app;
  browser confirmed Preview 2, proving it serves the newer revision.
- Second feature branch 2d53d31: https://krito-ak8k1kvqw-anton-personal-projects.vercel.app (Ready).
- Stable second branch: https://krito-git-feat-setup-second-preview-anton-personal-projects.vercel.app;
  browser confirmed Preview B with generic inherited frontend variables.
- Local, main, and both feature browsers confirm development / setup-v1 from
  https://majestic-sturgeon-687.eu-west-1.convex.cloud.
- Browser private PDF roundtrip verified on localhost, immutable first preview,
  and stable second branch; signed PUT/GET HTTP 200 and exact fixture bytes.
  A direct unsigned request was rejected with HTTP 400 (missing authentication).
- CORS reconciled exact localhost/main/branch/immutable project origins.
- Preview logs run npm ci then scripts/buildVercel.ts and next build only;
  no Convex backend publication, deploy key, watcher, or seed step.
- Current backend source commit: 5a5e4c5 (single explicit dev publication).
- Setup-only probe and automation capabilities are revoked after testing;
  scheduled fixture cleanup remains available, and all-deployment protection stays on.

PRs #1, #2 and #3 are merged. The development catalog and private analysis workflow are now active. Production backend and bucket remain deferred.

## Public frontend domain

On 2026-10-12, the user requested public access to `krito.be`. Both `krito.be`
and `www.krito.be` are verified production domains; the apex redirects to `www`.
Cloudflare's zone is active and forwards requests to Vercel.

Vercel Authentication previously used `ssoProtection.deploymentType=all`, which
redirected unauthenticated visitors to Vercel login. It now uses Standard Protection
(`all_except_custom_domains`): production domains are public, while previews and
generated deployment URLs remain protected. `npm run infra:vercel` reconciles and
verifies this setting so it cannot restore the old login requirement.

This changes frontend access only; the existing development backend and bucket
remain selected.

## Static page rendering

The homepage, privacy page, material page and both result demos are generated as
complete static HTML. The material form renders immediately; uploads become
available after the browser restores the selected topic and Convex validates it.
Private `/results/[analysisId]` URLs use a pre-rendered shell with navigation and
a neutral heading; access checks and results use the current tab's credentials
after hydration. Missing access is shown only after browser storage is checked.

Keep Suspense boundaries around URL-dependent content and background analytics,
rather than around the whole application. Convex uses an explicit logger because
its default logger creates a random ID during construction, preventing Next.js
Cache Components from pre-rendering the provider's children.

Run `npm test` and `npm run test:prerender` after changing routes, providers or
loading boundaries. The latter builds the frontend and verifies visible HTML and
the production pre-render manifest for all six page variants, without publishing
the frontend or backend. Search, uploads and private results still need JavaScript
and the selected development backend.

For local iteration, use `npm run dev` on port 3000. A production `next start`
process must be stopped before rebuilding its `.next` output and restarted after
the build. The prior localhost process returned HTTP 500 for a JavaScript chunk
while serving rebuilt output; a fresh development server avoids those mismatches.

## Document converter

Word, PowerPoint, spreadsheet and text uploads are converted to PDF by Gotenberg (LibreOffice) on Cloud Run. One-time setup:

1. Install the Google Cloud CLI without root into `~/.local/google-cloud-sdk` (the script finds it there), run `gcloud auth login`, and create or choose a project linked to a billing account. Cloud Run's free tier (2 million requests, 180,000 vCPU-seconds and 360,000 GiB-seconds per month) covers thousands of conversions, but Google requires a billing account, and outbound data from Europe is billed per GB; add a small budget alert.
2. Put its ID in `gcpProject` in `infra/development.json` (`gcpRegion` defaults to `europe-west1`).
3. Run `npm run infra:converter`. It generates basic-auth credentials in `.secrets/development.env` if missing, deploys `gotenberg/gotenberg:8-libreoffice-cloudrun` as `krito-converter-dev` (scales to zero, 2 GiB), and sets `CONVERTER_URL`, `CONVERTER_USERNAME` and `CONVERTER_PASSWORD` on Convex development.

The configured project is `gen-lang-client-0534719308` (`personal-dev-projects`).
Its linked paid billing account and the user's project Owner role were verified
in the Google Cloud console on 2026-10-12. The CLI is installed and authenticated
as `anton.verhasselt@gmail.com`. The user is handling the €10 monthly budget.

| Variable | Runtime location | Where the value comes from |
| --- | --- | --- |
| `CONVERTER_URL` | Convex development (`majestic-sturgeon-687`) | Cloud Run's service URL, retrieved by the deployment script after deployment. |
| `CONVERTER_USERNAME` | Convex development and local `.secrets/development.env` | The deployment script defaults to `krito`. |
| `CONVERTER_PASSWORD` | Convex development and local `.secrets/development.env` | The deployment script generates a random password if missing. |

On Cloud Run, the same credentials are installed as
`GOTENBERG_API_BASIC_AUTH_USERNAME` and `GOTENBERG_API_BASIC_AUTH_PASSWORD`,
alongside `API_ENABLE_BASIC_AUTH=true` and `API_TIMEOUT=110s`.
No Google API key or service-account JSON key is needed for this workflow.
Converter variables belong on Convex, not Vercel or `NEXT_PUBLIC_*` variables.
New worktrees need the existing ignored `.env.local` and owner-only
`.secrets/development.env` before running the deployment script.

Without these variables PDFs still work; other files are marked "Het omzetten naar pdf lukt even niet".

### Verified deployment (2026-10-12)

- Service: `krito-converter-dev`, `europe-west1`, project `gen-lang-client-0534719308`.
- Endpoint: `https://krito-converter-dev-v3elxbdhoa-ew.a.run.app`.
- Ready revision: `krito-converter-dev-00001-dsb`; 2 CPUs, 2 GiB, minimum 0 instances, maximum 10, concurrency 2, request timeout 120 seconds.
- All three converter variables are installed on Convex `majestic-sturgeon-687`; the username/password were read back and matched the protected local input without printing their values.
- Conversion requests without credentials and with an incorrect password returned HTTP 401. Correct credentials produced valid PDFs for DOCX, PPTX, XLSX, semicolon CSV, Windows-1252 text, Pages, Keynote and Numbers.
- The same eight fixtures passed the full private upload → Convex conversion → private PDF storage flow. Word pages, presentation slides and spreadsheet sheets had the expected counts; CSV/text accents survived conversion. Authorized sealed-PDF downloads and page links worked; unsigned downloads and wrong analysis capabilities were denied.
- The results page displayed converted source names and citations. Analysis-provider output was deterministic fixture data for this validation; conversions and storage used the real services.
- All 46 unit tests, lint and TypeScript checks passed. Desktop and mobile end-to-end flows passed. The first mobile run was blocked by the analytics prompt in the separately running frontend; the mobile rerun used a fresh test context with analytics consent declined.
- Apple fixtures came from [LibreOffice's libetonyek tests](https://github.com/LibreOffice/libetonyek/tree/master/src/test/data). This verifies representative supported files, not every iWork format/version.

The CLI is a setup tool only. During an upload, Convex calls the converter's
HTTP API directly with server-side basic authentication. Its generated password
does not expire when a browser or CLI Google login expires. Keep the protected
credential file for repeat deployments; changing the pair is a credential
rotation and must update Cloud Run and Convex together. No additional frontend
deployment or Google login is required for normal conversions.

The converter is connected to the existing development backend used by this
project. A separate production Convex backend and its converter credentials
remain part of the deferred production release.

### Repeatable converter tests

After changing conversion, upload validation, file types or converter settings:

```bash
npm test
npm run test:converter
```

`npm test` runs fast tests without external services. They cover missing
configuration, basic-auth request headers, 401/403 failures, retryable 429/5xx
responses, timeouts, converted-file size limits, CSV normalization, legacy text
encoding and local image conversion.

`npm run test:converter` takes roughly two to four minutes and checks the actual
development service and backend. It reads the installed converter variables
from Convex, verifies that missing/incorrect credentials return 401, and converts
the eight [checked-in fixtures](../tests/fixtures/converter/README.md). It checks
PDF parsing, expected page counts, Office/text content, accents and rejection of
a truncated DOCX archive. It then uploads all eight sources through the public
Convex API, waits for conversion, checks that drafts are not exposed, submits a
deterministic analysis, and verifies sealed PDF contents, citation page bounds,
page links, and denial of unsigned downloads and wrong capabilities.

Run it from this repository with its selected development `.env.local`, an
authenticated Convex CLI and `pdftotext` on PATH (provided by Poppler; already
installed on this machine). GCP CLI authentication and a running frontend are
not required. Missing prerequisites or failed checks return a nonzero exit code;
credentials, signed URLs and provider responses are not printed. It creates only
its own marked test draft and schedules cleanup even when a later check fails.
Upload polling allows the backend's full validation budget. The development
cleanup mutation retains rows while conversion or analysis is still running,
then retries cleanup after settlement so late PDF writes remain tracked.

The command does not deploy, publish backend code, rotate credentials, call the
real AI models or alter normal teacher analyses. It is an explicit test command;
no CI workflow or scheduled test run was added. Use the existing
`npm run test:e2e:dev` separately when changing the browser upload/results flow.

Validated on 2026-10-12: the unit suite, the complete live converter test,
lint and TypeScript checks passed. The live test's marked draft was cleaned up.

## Daily workflow

Run npm run dev in one terminal. Publish backend changes deliberately with npx convex dev --once; no backend watcher is needed during normal frontend work. This project's
explicit selector is dev:majestic-sturgeon-687. Keep one backend writer active;
frontend builds and branches must be compatible with that shared backend. One-off
publication: npx convex dev --once. Frontend Git integration is the only automatic
frontend deployment mechanism; GitHub Actions runs checks only.

Before preview storage testing, wait for Ready, run npm run infra:cors, and use the
actual immutable or stable branch origin. Fresh immutable URLs need another sync.
A temporary development-only storage fixture capability is used for setup probes;
it expires after two hours and must be removed from the backend after verification.
Fixture objects are scheduled for deletion after ten minutes.

## Repeating the storage setup checks

Run `npx tsx scripts/prepareStorageSmoke.ts` for a temporary fixture capability and
`npx tsx scripts/setupAutomation.ts` for protected browser automation. Run
`npx tsx scripts/storageSmoke.ts` for signed roundtrip and unsigned denial checks.
The collaborative browser runs the same PUT/GET byte verification at the actual
local/preview origin, after `npm run infra:cors`. Capability input is read from
ignored owner-only files, and signed URLs are never intentionally printed.
Finish with `npx tsx scripts/setupAutomation.ts --disable`. Fixture objects are
scheduled for deletion after ten minutes. Provider responses are filtered before
logging; browser network diagnostics can contain signed URLs and should be omitted.

## Accepted catalog/search update

The user authorized scraping https://opstap.katholiekonderwijs.vlaanderen/ for this
MVP and requested all groups/ages. Preserve the full source hierarchy and its age
and route semantics. Replace the earlier multiple-filter selector with flexible
search that exposes matching results and age tags. Commercial reuse will be
revisited with the source owner later; no commercial launch is part of this setup.

The complete Op.stap 1.3 catalog has now been imported and published in the selected Convex development deployment: 15,290 original records, 7,488 goals, 4,607 topic/group entries. The original records were audited by type against the archive, and the repeat refresh was an exact no-op. Use `npm run goals:update` to refresh development. See [catalog operations](../data/opstap/README.md) and [accepted teacher-flow changes](product-decisions.md): search results show subdomains only and choosing one includes all its goals automatically.
