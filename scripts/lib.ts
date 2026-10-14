import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export const development = JSON.parse(readFileSync("infra/development.json", "utf8")) as {
  githubRepository: string;
  convexTeam: string;
  convexProject: string;
  convexDeployment: string;
  convexUrl: string;
  cloudflareAccountId: string;
  r2Bucket: string;
  vercelScope: string;
  vercelProject: string;
  /** Google Cloud project that hosts the document converter on Cloud Run. */
  gcpProject: string;
  gcpRegion: string;
  /** Launch domains that upload to the bucket next to the Vercel deployments. */
  publicOrigins: string[];
};

/** The launched backend. Shared accounts (GitHub, Vercel, Cloudflare, Google Cloud) are in development.json. */
export const production = JSON.parse(readFileSync("infra/production.json", "utf8")) as {
  convexDeployment: string;
  convexUrl: string;
  convexSiteUrl: string;
  r2Bucket: string;
  converterService: string;
  /** The only origins that upload to the production bucket. */
  publicOrigins: string[];
};

export function readEnv(path = ".env.local"): Record<string, string> {
  const parsed = parseEnv(readFileSync(path, "utf8"));
  return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export function assertDevelopment(): void {
  const local = readEnv();
  if (local.CONVEX_DEPLOYMENT !== development.convexDeployment ||
      local.NEXT_PUBLIC_CONVEX_URL !== development.convexUrl) {
    throw new Error("Local Convex selector does not match infra/development.json.");
  }
  if (!development.convexDeployment.startsWith("dev:") || development.r2Bucket !== "krito-pdfs-dev") {
    throw new Error("This workflow only supports the selected development resources.");
  }
}

export function assertProduction(): void {
  if (!production.convexDeployment.startsWith("prod:") || production.r2Bucket !== "krito-pdfs") {
    throw new Error("infra/production.json does not describe the production resources.");
  }
}

/** The backend, bucket and converter a script works on. */
export type Target = {
  appEnv: "development" | "production";
  /** Convex deployment name, for `--deployment`. */
  deployment: string;
  r2Bucket: string;
  converterService: string;
  /** Owner-only protected input for this backend's secrets. */
  secretsFile: string;
};

/** Development, unless the command explicitly passes `--production`. */
export function selectTarget(): Target {
  if (process.argv.includes("--production")) {
    assertProduction();
    return {
      appEnv: "production",
      deployment: production.convexDeployment.slice("prod:".length),
      r2Bucket: production.r2Bucket,
      converterService: production.converterService,
      secretsFile: ".secrets/production.env",
    };
  }
  assertDevelopment();
  return {
    appEnv: "development",
    deployment: development.convexDeployment.slice("dev:".length),
    r2Bucket: development.r2Bucket,
    converterService: "krito-converter-dev",
    secretsFile: ".secrets/development.env",
  };
}

// Provider output may contain secrets. Never print raw failures or responses.
export function cli(command: string, args: string[], input?: string): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(args[0] === "wrangler" ? { CLOUDFLARE_ACCOUNT_ID: development.cloudflareAccountId } : {}) },
    });
  } catch {
    throw new Error(`${command} operation failed; provider output withheld to protect credentials.`);
  }
}

export function vercelApi<T>(endpoint: string): T {
  return JSON.parse(cli("npx", ["vercel", "api", endpoint, "--scope", development.vercelScope])) as T;
}
