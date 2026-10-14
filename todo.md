# To do

Open work that isn't finished in code yet. Tick items off here when they're done.

## Document converter (file conversion)

Word, PowerPoint, spreadsheet, text and iWork uploads are converted to PDF by a self-hosted Gotenberg (LibreOffice) service on Cloud Run. The development service is deployed and connected to Convex. Missing and incorrect credentials are rejected; real conversions, private PDF storage, page counts and page links were verified on 2026-10-12. Details are in [docs/setup.md](docs/setup.md#document-converter).

- [x] Install the Google Cloud CLI in `~/.local/google-cloud-sdk`.
- [x] Run `gcloud auth login` for project `gen-lang-client-0534719308`.
- [x] Verify that project `gen-lang-client-0534719308` has a billing account.
- [x] Add a €10 monthly budget alert to that billing account (done by the user).
- [x] Put the project ID in `gcpProject` in `infra/development.json` (`gen-lang-client-0534719308`).
- [x] Run `npm run infra:converter`. It deploys `krito-converter-dev` in `europe-west1` and sets `CONVERTER_URL`, `CONVERTER_USERNAME` and `CONVERTER_PASSWORD` on Convex development.
- [x] Test real uploads end to end: a .docx, .pptx, .xlsx, semicolon .csv, Windows-1252 .txt, Pages, Keynote and Numbers. Check page counts, citations and page links (real conversions/storage; deterministic analysis fixtures).
- [x] Run development desktop/mobile end-to-end checks against the deployed backend (mobile test context declined the analytics prompt).
- [x] Add repeatable regression checks: `npm test` for conversion code and `npm run test:converter` for actual authentication, eight upload formats, private PDFs and page links.
- [x] Deploy the production converter `krito-converter` with its own credentials and connect it to Convex production (2026-10-14).
- [x] Store originals at upload and convert only when the analysis starts; unreadable files are left out and named on the results page (2026-10-12).
- [x] Add www.krito.be and krito.be to the R2 CORS rule; uploads from the launch domain were blocked (2026-10-12).
