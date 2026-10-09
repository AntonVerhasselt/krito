# Krito

Dutch-language goal coverage analysis for teachers. Select published Op.stap goals,
upload private PDFs, and enter an email after clicking Analyze. Results will appear
on the same page. No login, dashboard, PDF reports, or email delivery in this MVP.

Licensed under the **MIT License**; see [LICENSE](LICENSE).
Copyright holder: Anton Verhasselt, verified against Git and GitHub identities.

## Setup order

1. Scaffold and push the public GitHub repository.
2. Configure one authenticated Convex cloud development deployment.
3. Configure a private development R2 bucket and backend secrets.
4. Configure Vercel settings and frontend variables before connecting GitHub.
5. Verify main, branch, PR, repeat-push, and private PDF checks.
6. Proceed to the goal catalog and analysis workflow after setup passes.

The supplied specification is in [docs/specification.md](docs/specification.md).
[docs/setup.md](docs/setup.md) records actual resources and unfinished prerequisites.
Planned resources must not be treated as already created.

## Local commands

Use Node **24.21.0** (`.nvmrc` / `.node-version`). Vercel uses supported Node 24.x.
With mise, prefix commands with `mise exec node@24.21.0 --`.

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
```

After cloud setup, run `npx convex dev` separately. Keep one backend writer active:
local, hosted main, and previews share the selected development deployment.
Frontend builds must never publish Convex during this phase. Backend secrets belong
in Convex development, never Vercel or Git.

Production backend configuration remains deferred until the MVP is ready and the
user explicitly declares readiness.
