# Setup record

Setup is in progress. Steps 2–10 cannot begin until step 1 passes verification.

## Verified identities

- Git author: Anton Verhasselt, anton.verhasselt@gmail.com.
- GitHub: AntonVerhasselt; explicitly confirmed by the user.
- Vercel personal account: anton-personal; personal scope anton-personal-projects.
- Cloudflare personal account: Anton.verhasselt@gmail.com's Account,
  account ID 546e2c266bb5a2e5d81edac39a4982ef.
- Convex: stored authentication exists; team and project not selected yet.
- OpenAI: no project API key in the process environment; account smoke test pending.

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
