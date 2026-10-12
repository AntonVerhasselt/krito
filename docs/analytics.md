# PostHog analytics

Krito uses the EU PostHog project for explicit product events, masked session
recordings, error tracking, and metadata-only AI observability. The shared event
registry and property allowlist live in `shared/analytics.ts`. Analytics is best
effort: disabled tracking, network failures, and delivery retries must not prevent
searching, uploading, submitting, or completing an analysis.

## Configuration

Copy the public settings in `.env.example` to ignored `.env.local`, supply the
project token, and set `NEXT_PUBLIC_POSTHOG_ENABLED=true` when deliberately testing
or running the hosted site. Missing settings disable the integration. Restart the
Next.js process after changing public variables; production embeds them at build
time.

- `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`: public project ingestion token.
- `NEXT_PUBLIC_POSTHOG_HOST`: `https://eu.i.posthog.com`.
- `NEXT_PUBLIC_POSTHOG_ENABLED`: explicit master switch, `true` to enable.
- `NEXT_PUBLIC_KRITO_ENVIRONMENT`: `local`, `preview`, or `hosted`.
- `NEXT_PUBLIC_POSTHOG_DEBUG`: local sanitized event diagnostics; omit on hosted
  deployments.
- `NEXT_PUBLIC_KRITO_RELEASE`: optional release ID; the integration can fall back
  to `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` or `development`.

Run `npm run env:posthog` to reconcile ingestion settings on the selected Convex
development deployment and the already-linked Vercel project. The script asserts
the selectors in `infra/development.json`, checks the linked Vercel account and
project, rejects conflicting branch overrides, and never prints credentials or
raw provider responses. Vercel targets are classified separately: Development
is `local`, Preview is `preview`, and Production is `hosted`. That classification
describes the frontend; all three still use the selected development backend.
This does not launch a production backend or publish any code. New frontend
deployments are needed to use changed public build variables.

Convex receives `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST` only. Never place OpenAI,
R2, Convex deployment credentials, or PostHog private keys in public variables.
Local debug is explicitly enabled for browser verification and should be removed
or set to `false` afterwards.

Backend events originating from localhost are suppressed by default. Temporarily
set `POSTHOG_ENABLE_LOCAL=true` on the exact development deployment for a deliberate
browser verification, and remove it afterwards. Automated fixtures are excluded
from normal telemetry; any deliberate analytics test events must carry
`is_test=true` and remain separate from hosted reporting. Test doubles must not be
mistaken for real provider usage or successful account-side ingestion.

## Consent and privacy

Tracking and replay require opt-in. The browser SDK starts after consent, and
backend analytics context only accompanies consenting operations. Refusal and
withdrawal suppress new browser collection; withdrawal is also communicated to
the authorized analysis so later workflow telemetry is suppressed. Previously
sent events and completed recordings remain in PostHog until removed there.

Explicit events collect interaction methods, stable catalog/goal identifiers,
counts, formats, sizes, safe error codes, and durations. Raw search text, partial
email input, filenames, document content, quotations, access capabilities, signed
URLs, and provider response bodies are excluded. The shared helper drops unknown
property names and unsafe property values. Arbitrary objects must never be spread
into event properties.

Autocapture is disabled in favor of explicit events. Replay masks all inputs and
document-derived text, with private content blocked. Console recording and network
payload recording are disabled. Default SDK URL and error properties are sanitized
before capture. Review recordings whenever a new upload/results component is
introduced; an ordinary text node can contain private information even when inputs
are masked. Document tabs and signed storage payloads are outside the recording
scope.

## Identity

An accepted email submission identifies the PostHog person using the existing
Convex contact ID. The profile stores the trimmed submitted `email`, normalized
`email_domain`, `email_verified=false`, and `identity_type=email_contact`.
Typing, invalid addresses, personal-email rejection, and cancelled forms do not
create profiles. Addresses are contact details, not authenticated identities.

Anonymous events are linked through identification. A browser that switches to a
different known contact resets its previous analytics identity first, preventing
two contacts from being merged on a shared device. Refresh restoration uses an
authorized analysis response, never an analytics ID as an access credential.
The domain is stored as a property; organization grouping is deferred until there
is a verified domain-to-organization mapping.

## Event semantics

Use `shared/analytics.ts` as the authoritative name registry. Related events have
different meanings and must remain separate:

| Area | Events and interpretation |
| --- | --- |
| Search | `search_clicked` records a pointer click; `search_opened` a state transition; `search_typing_started` the first actual edit; settled `search_query_updated` carries only lengths. Result counts, no-results, pagination, suggestions, and subject selection show where discovery fails. |
| Upload | `upload_picker_opened` records intent. Selection/rejection, batch, registration, transfer, validation, conversion, readiness, removal, and failures cover the full path. `upload_completed` means acknowledged transfer; only backend `file_ready` means the material can be analyzed. |
| Email | Gate views, typing, rejection, cancellation, and submission measure friction. `user_profile_created` means a new application contact was created; `$identify` sets the PostHog profile. |
| Analysis | `analysis_submitted` means accepted and queued; `analysis_started` means processing began; `analysis_completed` means final results persisted. Backend events survive browser departure. Failed rechecks can still produce completed results needing review. |
| Retry/recovery | Manual analysis retries, automatic model-run retries, and recovery of stalled work remain separate. Analysis `attempt` and provider-run `generation` distinguish repetitions. |
| Results | Processing views, completed-results views, goal details, clarification, evidence, retry, and restart show whether users receive and inspect the outcome. `evidence_opened` confirms link retrieval/navigation initiation, not external PDF rendering. |
| Homepage | Navigation, CTA, mobile-menu, FAQ, example-goal, section, and source-link events measure discovery. Demo interactions carry `is_demo=true`. |
| AI | `$ai_generation` records actual completed/failed generations with model, tokens, latency, trace/run IDs and safe error data. Poll requests are not generations. Prompts, documents, and model output are excluded. Missing cost is unknown rather than zero. |

Browser event properties include a schema version, safe route pattern, environment,
release, and journey context. Workflow events also carry analysis/attempt/run/file
identifiers as appropriate. Originating session IDs connect backend activity with
replays without exposing access capabilities. Use analysis IDs to examine one
workflow; use person IDs for contact activation and returning usage.

Canonical backend outcomes are emitted from guarded state transitions. The
PostHog Convex component schedules delivery independently of provider work. This
provides best-effort telemetry with bounded delivery behavior rather than a
business transaction guarantee. Do not use PostHog event totals as a billing ledger.

## Errors and source maps

Unexpected caught errors use safe operation names and codes. Browser unhandled
errors and rejections, Next.js request/render errors, and Convex failures are
captured without request bodies, sensitive messages, or arbitrary provider
payloads. Ordinary user validation rejections are product events rather than
exception issues. A blocked or unreachable analytics service must not affect the
user's operation.

Readable production traces require build-only `POSTHOG_PERSONAL_API_KEY` and
`POSTHOG_PROJECT_ID`, using management host `https://eu.posthog.com`. Use a key
scoped to this project with `error_tracking:write`. Keep it in secure build secrets,
never in browser variables. Source-map upload is enabled only when both are
configured; uploaded maps are deleted from the deployed asset output. Without
those credentials, exception capture still works but deployed stack locations may
remain minified.

## PostHog account setup

The public project token allows ingestion and identification, but cannot read
ingested events, manage project settings, create dashboards, or upload source maps.
No private management credentials were available during initial setup. Account
configuration therefore remains reproducible rather than falsely marked complete.

To configure it, place `POSTHOG_PERSONAL_API_KEY` and numeric `POSTHOG_PROJECT_ID`
in ignored `.secrets/posthog.env` with mode `600`, or provide them as process
environment variables. The private key needs project read/write, dashboard
read/write, insight read/write, and event-definition read/write scopes. Then run:

```sh
npm run env:posthog -- --account
```

The script checks the project's ingestion token before any account mutation,
anonymizes IP addresses, enables project session recording, adds descriptions to
the registered events, and creates missing named dashboards/insights. Its management
requests stay on the EU project host. Reruns preserve existing insight edits.
It does not modify billing, retention tiers, notification destinations, historical
data, or organization grouping.

The two initial dashboards include:

- **Krito · Activation**: ordered teacher funnel, search discovery, and result
  engagement.
- **Krito · Reliability**: upload/conversion outcomes, analysis outcomes, and
  retries/recovery.

Their insights include only `environment=hosted` and exclude demo/test events.
The funnel measures person progression within seven days; use event context and
SQL when investigating a single analysis attempt or concurrent journeys. Local
browser checks and preview runs deliberately do not contribute to these totals.
Use PostHog's built-in Web Analytics, Error Tracking, Session Replay, and AI
Observability views for their specialized metrics. Start alerts after establishing
a traffic baseline and choosing explicit recipients; none are silently sent.

In the account UI, confirm session replay is enabled, review masking, choose the
available retention target (30 days recommended), and check the spending limit.
Keep network payloads and console capture disabled. Browser SDK settings cannot
enable a product that is disabled at the project level. Some account controls and
retention choices depend on the subscription.

Feature flags, experiments, surveys, organization grouping, support, outbound
workflows, warehouse/CDP integrations and replay AI are deferred. They add value
after the baseline shows a specific need and any additional data-sharing or
messaging scope is chosen.

## Verification

The initial browser verification should use opt-in explicitly, then check live
network delivery and local sanitized diagnostics for search open/type/results,
subject selection, upload selection/transfer/readiness, accepted identity,
analysis start/completion, and result interactions. Verify refusal/withdrawal,
refresh restoration, shared-browser identity changes, failed uploads, retries,
and demo exclusion. Inspect event properties and recording masks for private data.
Do not print signed URLs, emails, raw exception bodies, or captured recording data
into test reports.

HTTP ingestion acceptance shows requests reached PostHog; event visibility in the
account, person profiles, replay playback, and deminified production errors require
authenticated account access. Record those limits separately from browser trigger
verification. Local diagnostics must not be presented as proof of server ingestion.

## Official references

- [Next.js integration](https://posthog.com/docs/libraries/next-js)
- [Convex integration](https://posthog.com/docs/libraries/convex)
- [Identification](https://posthog.com/docs/getting-started/identify-users)
- [Data collection controls](https://posthog.com/docs/privacy/data-collection)
- [Replay privacy](https://posthog.com/docs/session-replay/privacy)
- [Next.js error tracking](https://posthog.com/docs/error-tracking/installation/nextjs)
- [Source maps](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs)
- [Manual AI capture](https://posthog.com/docs/ai-observability/manual-capture)
- [API authentication](https://posthog.com/docs/api)
- [Project settings API](https://posthog.com/docs/api/projects)
- [Dashboards API](https://posthog.com/docs/api/dashboards)
- [Insights API](https://posthog.com/docs/api/insights)
- [Event definitions API](https://posthog.com/docs/api/event-definitions)

## Verification performed (2026-10-12)

The shared T3 browser exercised the actual local application against the selected
Convex development deployment and EU PostHog ingestion. Before opt-in, no PostHog
network requests were observed. After opt-in, search/click/typing/results/selection,
a one-page synthetic PDF upload, accepted email identification, completed results,
goal expansion and the blocked-popup evidence failure all triggered their semantic
events. Event requests to `/i/v0/e/` and recording requests to `/s/` returned HTTP
200; the recording SDK reported active capture. A synthetic unhandled browser error
produced a sanitized `$exception`, with no test email or private-content marker.

The real background analysis completed. Its scheduled PostHog deliveries reported
success for registration, validation, readiness, accepted submission, contact
creation/identification, preparation, initial model check, final generation and
analysis completion. The identify payload contained the exact submitted fixture
email and its separate lowercased domain. One AI generation included final token
usage. Workflow payloads contained neither the filename nor the private document
marker. The fixture used a reserved `.example` email and local environment tags;
it is excluded from hosted dashboards.

Withdrawing consent stopped recording, cleared diagnostic history, and removed the
backend analysis context while leaving the completed analysis accessible. Automated
regression tests cover privacy filtering, required public ingestion-token retention,
contact switching, opt-out, fail-open capture, generation deduplication and stale
callbacks. Lint, TypeScript, tests and a production build passed.

These checks verify triggers and ingestion acceptance. Authenticated PostHog event
queries, person-profile inspection, replay playback, dashboard provisioning and
source-map upload remain unverified without the private account credentials.
