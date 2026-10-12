# To do

Open work that isn't finished in code yet. Tick items off here when they're done.

## Document converter (file conversion)

Word, PowerPoint, spreadsheet, text and iWork uploads are converted to PDF by a self-hosted Gotenberg (LibreOffice) service on Cloud Run. The code is merged, but the service is **not deployed yet**. Until it is, only PDF, JPG and PNG uploads work; every other file shows "Het omzetten naar pdf lukt even niet". Steps are in [docs/setup.md](docs/setup.md#document-converter).

- [ ] Install the Google Cloud CLI in `~/.local/google-cloud-sdk`, run `gcloud auth login`, and pick or create a project with a billing account.
- [ ] Add a small budget alert to that billing account (outbound data from Europe is billed per GB).
- [ ] Put the project ID in `gcpProject` in `infra/development.json` (currently empty).
- [ ] Run `npm run infra:converter`. It deploys `krito-converter-dev` in `europe-west1` and sets `CONVERTER_URL`, `CONVERTER_USERNAME` and `CONVERTER_PASSWORD` on Convex development (none of these are set yet).
- [ ] Test real uploads end to end: a .docx, .pptx, .xlsx, semicolon .csv, Windows-1252 .txt and a Keynote/Pages file. Check the page count, citations and page links on the results page.
- [ ] Run `npm run test:e2e:dev` against the deployed converter.
- [ ] Plan the production converter (separate service and credentials) before launch.
