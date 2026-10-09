import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { assertDevelopment, cli, development, readEnv } from "./lib";

// Deploys the document converter (Gotenberg with LibreOffice) to Cloud Run in
// the EU and points the Convex development backend at it. Teacher files only
// pass through this service; it stores nothing.
assertDevelopment();
const { gcpProject: project, gcpRegion: region } = development;
if (!project) throw new Error("Set gcpProject in infra/development.json first.");
const service = "krito-converter-dev";
// gcloud on PATH, or the user-level install in ~/.local/google-cloud-sdk.
const local = join(homedir(), ".local/google-cloud-sdk/bin/gcloud");
const gcloud = process.env.GCLOUD ?? (existsSync(local) ? local : "gcloud");
const secrets = ".secrets/development.env";
if ((statSync(secrets).mode & 0o077) !== 0)
  throw new Error("Credential file must have owner-only permissions (chmod 600).");

let values = readEnv(secrets);
if (!values.CONVERTER_USERNAME || !values.CONVERTER_PASSWORD) {
  appendFileSync(
    secrets,
    `\n# Basic auth for the Cloud Run document converter\nCONVERTER_USERNAME=krito\nCONVERTER_PASSWORD=${randomBytes(24).toString("hex")}\n`,
  );
  values = readEnv(secrets);
}

// Pass credentials through a private temporary file, never on the command line.
const dir = mkdtempSync(join(tmpdir(), "krito-converter-"));
const envFile = join(dir, "env.yaml");
try {
  writeFileSync(
    envFile,
    [
      'API_ENABLE_BASIC_AUTH: "true"',
      'API_TIMEOUT: "110s"',
      `GOTENBERG_API_BASIC_AUTH_USERNAME: ${JSON.stringify(values.CONVERTER_USERNAME)}`,
      `GOTENBERG_API_BASIC_AUTH_PASSWORD: ${JSON.stringify(values.CONVERTER_PASSWORD)}`,
    ].join("\n"),
    { mode: 0o600 },
  );
  cli(gcloud, ["services", "enable", "run.googleapis.com", "--project", project]);
  cli(gcloud, [
    "run", "deploy", service,
    "--image", "docker.io/gotenberg/gotenberg:8-libreoffice-cloudrun",
    "--project", project,
    "--region", region,
    // Gotenberg's own basic auth protects the endpoint.
    "--allow-unauthenticated",
    "--memory", "2Gi",
    "--cpu", "2",
    "--concurrency", "4",
    "--min-instances", "0",
    "--max-instances", "3",
    "--timeout", "120",
    "--env-vars-file", envFile,
    "--quiet",
  ]);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const url = cli(gcloud, [
  "run", "services", "describe", service,
  "--project", project,
  "--region", region,
  "--format", "value(status.url)",
]).trim();
if (!url.startsWith("https://")) throw new Error("Cloud Run did not report a service URL.");
cli(
  "npx",
  ["convex", "env", "set", "--force", "--deployment", development.convexDeployment.slice(4)],
  Object.entries({
    CONVERTER_URL: url,
    CONVERTER_USERNAME: values.CONVERTER_USERNAME,
    CONVERTER_PASSWORD: values.CONVERTER_PASSWORD,
  })
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n"),
);
console.log(`Converter deployed to ${region} and connected to the development backend; credentials withheld.`);
