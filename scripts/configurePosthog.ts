import { existsSync, readFileSync, statSync } from "node:fs";
import { ANALYTICS_EVENTS } from "../shared/analytics";
import { assertDevelopment, cli, development, readEnv, vercelApi } from "./lib";

// Ingestion uses eu.i.posthog.com; management and source maps use eu.posthog.com.
const ingestionHost = "https://eu.i.posthog.com";
const managementHost = "https://eu.posthog.com";

function publicConfig() {
  const local = readEnv();
  const token = local.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim();
  if (!token || !/^phc_[A-Za-z0-9]+$/.test(token)) {
    throw new Error("Set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN in .env.local first.");
  }
  if (local.NEXT_PUBLIC_POSTHOG_HOST !== ingestionHost) {
    throw new Error("This setup requires the selected EU ingestion host.");
  }
  return { token };
}

function configureEnvironment() {
  assertDevelopment();
  const { token } = publicConfig();
  const link = JSON.parse(readFileSync(".vercel/project.json", "utf8")) as { projectId: string; orgId: string };
  const project = vercelApi<{ name: string; accountId: string }>(`/v9/projects/${link.projectId}`);
  if (project.name !== development.vercelProject || project.accountId !== link.orgId) {
    throw new Error("Linked Vercel project does not match the selected personal project.");
  }
  type Entry = { key: string; value: string; target: string[]; gitBranch?: string | null };
  const endpoint = `/v9/projects/${link.projectId}/env`;
  const existing = vercelApi<{ envs: Entry[] }>(endpoint).envs;
  const publicNames = ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_ENABLED", "NEXT_PUBLIC_KRITO_ENVIRONMENT"];
  if (existing.some((entry) => publicNames.includes(entry.key) && entry.gitBranch)) {
    throw new Error("Branch-scoped PostHog variables conflict with the shared environment setup.");
  }
  if (existing.some((entry) => entry.key === "NEXT_PUBLIC_POSTHOG_DEBUG" && entry.target.some((target) => target !== "development"))) {
    throw new Error("Remove hosted PostHog debug overrides before continuing.");
  }
  const values = {
    NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: token,
    NEXT_PUBLIC_POSTHOG_HOST: ingestionHost,
    NEXT_PUBLIC_POSTHOG_ENABLED: "true",
  };
  for (const [key, value] of Object.entries(values)) {
    cli("npx", ["vercel", "api", `/v10/projects/${link.projectId}/env?upsert=true`, "--method", "POST", "--input", "-", "--scope", development.vercelScope],
      JSON.stringify({ key, value, type: "plain", target: ["development", "preview", "production"] }));
  }
  const classifications = { development: "local", preview: "preview", production: "hosted" };
  for (const [target, value] of Object.entries(classifications)) {
    cli("npx", ["vercel", "api", `/v10/projects/${link.projectId}/env?upsert=true`, "--method", "POST", "--input", "-", "--scope", development.vercelScope],
      JSON.stringify({ key: "NEXT_PUBLIC_KRITO_ENVIRONMENT", value, type: "plain", target: [target] }));
  }
  const configured = vercelApi<{ envs: Entry[] }>(endpoint).envs;
  for (const [target, classification] of Object.entries(classifications)) {
    for (const [key, value] of Object.entries({ ...values, NEXT_PUBLIC_KRITO_ENVIRONMENT: classification })) {
      const matches = configured.filter((entry) => entry.key === key && entry.target.includes(target) && !entry.gitBranch);
      if (matches.length !== 1 || matches[0].value !== value) {
        throw new Error(`Configured ${key} does not match ${target}.`);
      }
    }
  }
  cli("npx", ["convex", "env", "set", "--force", "--deployment", development.convexDeployment.slice(4)],
    Object.entries({ POSTHOG_PROJECT_TOKEN: token, POSTHOG_HOST: ingestionHost })
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`).join("\n"));
  for (const [name, value] of Object.entries({ POSTHOG_PROJECT_TOKEN: token, POSTHOG_HOST: ingestionHost })) {
    const actual = cli("npx", ["convex", "env", "get", name, "--deployment", development.convexDeployment.slice(4)]).trim();
    if (actual !== value) throw new Error(`Backend ${name} readback does not match.`);
  }
  console.log("PostHog ingestion configured on selected Convex development and Vercel Development/Preview/Production.");
  console.log("Frontend targets classified local/preview/hosted. Credentials and provider responses withheld. No backend publication or deployment performed.");
}

type Resource = { id: number | string; name: string; deleted?: boolean };
type Page<T> = { results: T[]; next?: string | null };

async function configureAccount() {
  const { token } = publicConfig();
  const credentialFile = ".secrets/posthog.env";
  const protectedValues = existsSync(credentialFile) ? (() => {
    if ((statSync(credentialFile).mode & 0o077) !== 0) throw new Error("PostHog credential file must have owner-only permissions (chmod 600).");
    return readEnv(credentialFile);
  })() : {};
  const key = process.env.POSTHOG_PERSONAL_API_KEY || protectedValues.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID || protectedValues.POSTHOG_PROJECT_ID;
  if (!key || !projectId || !/^\d+$/.test(projectId)) {
    throw new Error("Account setup requires POSTHOG_PERSONAL_API_KEY and numeric POSTHOG_PROJECT_ID in protected .secrets/posthog.env or process environment. The public ingestion token cannot manage settings or dashboards.");
  }
  const root = `/api/projects/${projectId}/`;
  async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const url = new URL(path, managementHost);
    if (url.origin !== managementHost || !url.pathname.startsWith(root)) {
      throw new Error("Refusing to send private credentials outside the selected EU project.");
    }
    let response: Response;
    try {
      response = await fetch(url, {
        method, redirect: "error", signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch { throw new Error("PostHog management request failed; details withheld to protect credentials."); }
    if (!response.ok) throw new Error(`PostHog management request failed (${response.status}); response withheld.`);
    return await response.json() as T;
  }
  async function all<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let next: string | null | undefined = path;
    while (next) {
      const page: Page<T> = await api<Page<T>>(next);
      items.push(...page.results);
      next = page.next;
    }
    return items;
  }
  const project = await api<{ api_token: string }>(root);
  if (project.api_token !== token) throw new Error("The selected PostHog project does not match the configured ingestion token. No account changes made.");
  // Only enable requested functionality and anonymize network IPs. No billing,
  // retention-tier, notification, grouping, or historical-data changes.
  await api(root, "PATCH", { anonymize_ips: true, session_recording_opt_in: true });
  const definitions = await all<Resource>(`${root}event_definitions/?limit=100`);
  const detail: Record<string, string> = {
    upload_completed: "Browser file transfer completed and backend acknowledged it; validation/conversion may still fail.",
    file_ready: "Backend validated the file and, where needed, completed conversion. The file can be analyzed.",
    analysis_submitted: "Backend accepted the school email and committed an analysis attempt to its queue.",
    analysis_started: "Backend began processing an accepted analysis attempt.",
    analysis_completed: "Backend persisted final results. Check needs_review/review_count for degraded rechecks.",
    analysis_completed_results_viewed: "Browser rendered completed results for the authorized analysis.",
    user_profile_created: "A new application contact was created after accepted email submission; email is unverified.",
    search_query_updated: "Settled query edit; only length and word count are captured, never raw text.",
    evidence_opened: "Signed document link obtained and tab navigation initiated; does not confirm viewer rendering.",
    $ai_generation: "Completed or failed provider generation with tokens and timing; no prompts, documents, or model outputs.",
  };
  for (const name of ANALYTICS_EVENTS) {
    const existing = definitions.find((entry) => entry.name === name);
    const description = detail[name] || `Krito: ${name.replaceAll("_", " ")}. Consenting usage only; safe metadata schema is documented in docs/analytics.md.`;
    if (existing) await api(`${root}event_definitions/${existing.id}/`, "PATCH", { description });
    else await api(`${root}event_definitions/`, "POST", { name, description });
  }
  const dashboards = await all<Resource>(`${root}dashboards/?limit=100`);
  const insights = await all<Resource>(`${root}insights/?limit=100&saved=true`);
  const properties = [
    { type: "event", key: "environment", operator: "exact", value: "hosted" },
    { type: "event", key: "is_demo", operator: "is_not", value: true },
    { type: "event", key: "is_test", operator: "is_not", value: true },
  ];
  const reports = [
    { name: "Krito · Activation", charts: [
      { name: "Krito · Teacher activation funnel", kind: "FunnelsQuery", events: ["search_opened", "subject_selected", "file_ready", "analysis_submitted", "analysis_completed", "analysis_completed_results_viewed"] },
      { name: "Krito · Search discovery", kind: "TrendsQuery", events: ["search_opened", "search_typing_started", "search_no_results", "subject_selected"] },
      { name: "Krito · Result engagement", kind: "TrendsQuery", events: ["analysis_completed_results_viewed", "result_goal_expanded", "evidence_opened", "analysis_new_clicked"] },
    ] },
    { name: "Krito · Reliability", charts: [
      { name: "Krito · Upload and conversion outcomes", kind: "TrendsQuery", events: ["upload_completed", "file_ready", "upload_failed", "file_validation_failed"] },
      { name: "Krito · Analysis outcomes", kind: "TrendsQuery", events: ["analysis_submitted", "analysis_completed", "analysis_failed", "analysis_goal_recheck_failed"] },
      { name: "Krito · Recovery and retries", kind: "TrendsQuery", events: ["analysis_retry_requested", "ai_run_retry_scheduled", "workflow_recovery_scheduled", "workflow_recovery_exhausted"] },
    ] },
  ];
  for (const report of reports) {
    let dashboard = dashboards.find((entry) => entry.name === report.name && !entry.deleted);
    if (!dashboard) dashboard = await api<Resource>(`${root}dashboards/`, "POST", {
      name: report.name, description: "Hosted consenting usage; demo, automated fixtures, previews and localhost excluded. Managed by npm run env:posthog -- --account.",
    });
    for (const chart of report.charts) {
      if (insights.some((entry) => entry.name === chart.name && !entry.deleted)) continue;
      const source = {
        kind: chart.kind, dateRange: { date_from: "-30d" }, properties,
        series: chart.events.map((event) => ({ kind: "EventsNode", event, name: event, ...(chart.kind === "TrendsQuery" ? { math: "total" } : {}) })),
        ...(chart.kind === "TrendsQuery" ? { interval: "day", trendsFilter: { display: "ActionsLineGraph" } } : {
          funnelsFilter: { funnelVizType: "steps", funnelWindowInterval: 7, funnelWindowIntervalUnit: "day", funnelOrderType: "ordered" },
        }),
      };
      await api(`${root}insights/`, "POST", { name: chart.name, saved: true, dashboards: [dashboard.id], query: { kind: "InsightVizNode", source } });
    }
  }
  console.log("Verified selected EU project. Enabled session replay/IP anonymization, documented events, and created missing activation/reliability dashboards.");
  console.log("Existing insight edits preserved. No messages, billing, exports, grouping, or retention-tier changes.");
}

try {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg !== "--account")) throw new Error("Usage: npm run env:posthog [-- --account]");
  if (args.includes("--account")) await configureAccount();
  else configureEnvironment();
} catch (error) {
  console.error(error instanceof Error ? error.message : "PostHog setup failed; details withheld.");
  process.exitCode = 1;
}
