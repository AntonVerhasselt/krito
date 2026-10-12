# To do

Open work that isn't finished in code yet. Tick items off here when they're done.

## Document converter (file conversion)

Word, PowerPoint, spreadsheet, text and iWork uploads are converted to PDF by a self-hosted Gotenberg (LibreOffice) service on Cloud Run. The development service is deployed and connected to Convex. Missing and incorrect credentials are rejected; real conversions, private PDF storage, page counts and page links were verified on 2026-10-12. Details are in [docs/setup.md](docs/setup.md#document-converter).

- [x] Install the Google Cloud CLI in `~/.local/google-cloud-sdk`.
- [x] Run `gcloud auth login` for project `gen-lang-client-0534719308`.
- [x] Verify that project `gen-lang-client-0534719308` has a billing account.
- [ ] Add a €10 monthly budget alert to that billing account (user is handling this).
- [x] Put the project ID in `gcpProject` in `infra/development.json` (`gen-lang-client-0534719308`).
- [x] Run `npm run infra:converter`. It deploys `krito-converter-dev` in `europe-west1` and sets `CONVERTER_URL`, `CONVERTER_USERNAME` and `CONVERTER_PASSWORD` on Convex development.
- [x] Test real uploads end to end: a .docx, .pptx, .xlsx, semicolon .csv, Windows-1252 .txt, Pages, Keynote and Numbers. Check page counts, citations and page links (real conversions/storage; deterministic analysis fixtures).
- [x] Run development desktop/mobile end-to-end checks against the deployed backend (mobile test context declined the analytics prompt).
- [x] Add repeatable regression checks: `npm test` for conversion code and `npm run test:converter` for actual authentication, eight upload formats, private PDFs and page links.
- [ ] Plan the production converter (separate service and credentials) before launch.
