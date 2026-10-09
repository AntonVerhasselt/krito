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
