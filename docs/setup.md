# Setup record

Setup is in progress. Steps 2–10 cannot begin until step 1 passes verification.

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

Git main/feature/PR/repeat-push/two-branch Ready deployments, hosted health, preview
origin synchronization, preview PDF upload/download, and frontend build logs are
still pending. Do not proceed to step 2 until these pass.

## Daily workflow

Run npm run dev in one terminal and npx convex dev in another. This project's
explicit selector is dev:majestic-sturgeon-687. Keep one backend writer active;
frontend builds and branches must be compatible with that shared backend. One-off
publication: npx convex dev --once. Frontend Git integration is the only automatic
frontend deployment mechanism; GitHub Actions runs checks only.

Before preview storage testing, wait for Ready, run npm run infra:cors, and use the
actual immutable or stable branch origin. Fresh immutable URLs need another sync.
A temporary development-only storage fixture capability is used for setup probes;
it expires after two hours and must be removed from the backend after verification.
Fixture objects are scheduled for deletion after ten minutes.
