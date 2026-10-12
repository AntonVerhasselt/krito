<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Converter checks

After changing conversion, upload validation, converter configuration or file
types, run `npm test` and `npm run test:converter`. The second command checks the
existing development converter and private upload/storage flow with synthetic
fixtures and deterministic AI output. It requires the selected `.env.local`,
authenticated Convex CLI and `pdftotext`; it does not deploy, rotate credentials
or publish a backend. See the document-converter section in `docs/setup.md`.
