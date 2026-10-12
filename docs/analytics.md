# PostHog analytics

Krito uses the EU PostHog project for explicit product events, error tracking,
and metadata-only AI observability. Session recording is disabled at the user’s
request on 2026-10-12: the SDK cannot start replay, snapshot events are rejected,
and the account setup script enforces recording off. The shared event
registry and property allowlist live in `shared/analytics.ts`. Analytics is best
effort: disabled tracking, network failures, and delivery retries must not prevent
searching, uploading, submitting, or completing an analysis.

## Configuration

Copy the public settings in `.env.example` to ignored `.env.local`, supply the
project token, and set `NEXT_PUBLIC_POSTHOG_ENABLED=true` when deliberately testing
or running the hosted site. Missing browser settings disable browser tracking. Restart the
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

The registered Convex component requires `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`
on the selected backend before Convex code generation or publication. Run
`npm run env:posthog` first. Keep those backend installation prerequisites configured
even when disabling browser collection. Once installed, capture helpers fail open
on delivery failures; the component's deployment prerequisites are not optional.

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

Usage tracking requires opt-in. The browser SDK starts after consent, and
backend analytics context only accompanies consenting operations. Refusal and
withdrawal suppress new browser collection; withdrawal is also communicated to
the authorized analysis so later workflow telemetry is suppressed. Previously
sent events remain in PostHog until removed there.

Explicit events collect interaction methods, stable catalog/goal identifiers,
counts, formats, sizes, safe error codes, and durations. Raw search text, partial
email input, filenames, document content, quotations, access capabilities, signed
URLs, and provider response bodies are excluded. The shared helper drops unknown
property names and unsafe property values. Arbitrary objects must never be spread
into event properties.

Autocapture is disabled in favor of explicit events. Session recordings are
explicitly disabled with `disable_session_recording: true`; initialization,
consent regrant and contact changes never start recording. The ingestion filter
also rejects `$snapshot` events. Default SDK URL and error properties are
sanitized before capture. The privacy prompt describes the purpose of usage
measurement, the school-email link and the ability to change the choice, with
matching accept and decline buttons.

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
| Report | `report_download_clicked/completed/failed` in the browser; backend `report_generated`-style outcomes are covered by the download result and the report e-mail. |
| Reminder | `reminder_prompt_viewed` fires once per topic when the mobile card is shown; `reminder_gate_opened/closed`, `reminder_submit_requested/failed` measure the modal; backend `reminder_requested` means accepted and queued. `email_typing_started` and `email_validation_failed` carry `source` (`analysis` or `reminder`). |
| E-mail | `email_message_queued/sent/skipped/failed` come from Convex; `delivered`, `delivery_delayed`, `bounced`, `complained`, `opened` and `clicked` from the Resend webhook. Opens and clicks are counted once per message; a click within 10 seconds of delivery has `is_bot_suspected=true` (school link scanners). Apple Mail preloads images, so opens are a trend, not a fact. `email_link_opened` is a visit through a link with `?via=` (`herinnering`, `welkom-1..3`). Properties: `email_kind`, `sequence_step`, `email_variant` (the md file sent). Addresses, message content and Resend ids are never sent. |
| Welcome | `welcome_sequence_started` (with `source`), `welcome_sequence_completed`, `welcome_sequence_stopped` (with `reason`: unsubscribed, bounced, complained, email_disabled…), `email_unsubscribed`. |
| AI | `$ai_generation` records actual completed/failed generations with model, tokens, latency, trace/run IDs and safe error data. Poll requests are not generations. Prompts, documents, and model output are excluded. Missing cost is unknown rather than zero. |

Browser event properties include a schema version, safe route pattern, environment,
release, and journey context. Workflow events also carry analysis/attempt/run/file
identifiers as appropriate. Originating session IDs connect backend activity with
browser events without exposing access capabilities. Use analysis IDs to examine one
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
The selected EU project `199607` has been configured and verified through authenticated
account access. The setup script remains available for reproducible configuration.

To configure it, place `POSTHOG_PERSONAL_API_KEY` and numeric `POSTHOG_PROJECT_ID`
in ignored `.secrets/posthog.env` with mode `600`, or provide them as process
environment variables. The private key needs project, dashboard, insight,
event-definition and alert read/write scopes, plus user read (alerts go to the
key's owner). The script checks read access to all of them before it changes
anything. Then run:

```sh
npm run env:posthog -- --account
```

The script checks the project's ingestion token before any account mutation,
anonymizes IP addresses, disables project session recording, adds descriptions to
the registered events, and creates missing named dashboards/insights. Its management
requests stay on the EU project host. Reruns preserve existing insight edits.
It does not modify billing, retention tiers, notification destinations, historical
data, or organization grouping.

The dashboards include:

- **Krito · Activation**: ordered teacher funnel, search discovery, and result
  engagement.
- **Krito · Reliability**: upload/conversion outcomes, analysis outcomes, and
  retries/recovery.
- **Krito · E-mail** (2026-10-12): mobile hand-off funnel, welcome sequence
  (delivered, opened, clicked, link visits, unsubscribes), deliverability, and
  report downloads.

Their insights include only `environment=hosted` and exclude demo/test events.
The funnel measures person progression within seven days; use event context and
SQL when investigating a single analysis attempt or concurrent journeys. Local
browser checks and preview runs deliberately do not contribute to these totals.
Use PostHog's built-in Web Analytics, Error Tracking, and AI
Observability views for their specialized metrics.

Four hourly alerts (2026-10-12) e-mail the account owner when any hosted
`upload_failed`, `file_validation_failed` with `upload_validation_failed`,
`file_conversion_failed` or `analysis_failed` occurs in the past hour; each has a "Krito · Alert: …" source insight. They exist because
uploads from www.krito.be failed unnoticed while the R2 CORS rule lacked the
launch domain. `upload_failed` carries `stage`, `status` (HTTP status, 0 when
the browser blocked the request) and `hostname`; `error_code` `upload_blocked`
points at CORS, offline browsers or school network filters. Like all events,
they only cover consenting visitors; the Convex logs record every preparation
failure (`prepare <analysis>/<attempt>: <file> (<extension>) <code>`) without
file names.

The SDK disables replay independently of the account settings; account setup was
rerun on 2026-10-12 and also disabled recording at the project level. Historical
recordings are not removed by changing the SDK or project setting.

Two personal API keys exist, each with only the scopes it needs:

- **Account setup** (`.secrets/posthog.env`, local only): project, event_definition,
  dashboard, insight and alert read/write, plus user read (the alerts are sent to
  the key's owner). Used by `npm run env:posthog -- --account`.
  Create it under PostHog EU → Settings → Personal API keys if it was revoked.
- **Build source maps** (`.secrets/posthog-build.env` and Vercel
  `POSTHOG_PERSONAL_API_KEY`): `error_tracking:write` only.
  When PostHog rejects this key (401), `scripts/buildVercel.ts` builds without
  uploading source maps and prints a warning, so a revoked key never blocks a
  release. On 2026-10-12 the key was rejected and every Vercel build failed until
  this check existed; create a new `error_tracking:write` key and set it on Vercel
  to restore readable stack traces.

Neither belongs on Convex, which only needs the public `POSTHOG_PROJECT_TOKEN` and
`POSTHOG_HOST`.

E-mail events carry the analytics context of the request that caused the e-mail
(the analysis, or the reminder request), so they follow the same consent.

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
and demo exclusion. Verify no recorder script or snapshot requests appear after
consent or regrant. Inspect event properties for private data.
Do not print signed URLs, emails or raw exception bodies
into test reports.

HTTP ingestion acceptance shows requests reached PostHog; event visibility in the
account, person profiles, and deminified production errors require
authenticated account access. Record those limits separately from browser trigger
verification. Local diagnostics must not be presented as proof of server ingestion.

## Official references

- [Next.js integration](https://posthog.com/docs/libraries/next-js)
- [Convex integration](https://posthog.com/docs/libraries/convex)
- [Identification](https://posthog.com/docs/getting-started/identify-users)
- [Data collection controls](https://posthog.com/docs/privacy/data-collection)
- [Next.js error tracking](https://posthog.com/docs/error-tracking/installation/nextjs)
- [Source maps](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs)
- [Manual AI capture](https://posthog.com/docs/ai-observability/manual-capture)
- [API authentication](https://posthog.com/docs/api)
- [Project settings API](https://posthog.com/docs/api/projects)
- [Dashboards API](https://posthog.com/docs/api/dashboards)
- [Insights API](https://posthog.com/docs/api/insights)
- [Event definitions API](https://posthog.com/docs/api/event-definitions)

## Historical verification (2026-10-12, before recording removal)

The recording checks below document the earlier implementation. They are
superseded by the disabled-recording policy above.

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

Authenticated account queries also confirmed the linked browser journey and canonical
backend events, one completed AI generation (1,213 input / 339 output tokens), and two
sanitized browser exceptions. The fixture person has the exact submitted email,
separate lowercase domain, unverified contact status, and linked anonymous history.
Three test recordings are stored with 30-day retention; the restored session links
to that person. Decompressed stored replay snapshots mask the tested inputs and
contain no fixture email, filename, signed URL, capability hash, console payload, or
network payload. The signed-in PostHog Replay UI successfully rendered masked playback. Counts and booleans were inspected without exporting raw replay data.

Project recording and IP anonymization are enabled. Two Krito dashboards and six
production-filtered insights were created. Three obsolete dashboards and fifteen
news/archive insights were archived after checking their IDs/names and saving an
owner-only local backup. Historical events and people were retained because they
do not interfere with Krito reports. Local debug and temporary backend local capture
were disabled after testing.

Vercel Preview/Production have an encrypted, project-restricted build credential with
only `error_tracking:write`, plus the project ID. The temporary broader setup key was
revoked after verification, and its local credential file was removed. Source-map uploads use the supported
`symbol-set` release mode: Next 16.4 generated server chunks lack some native debug
IDs, so the default event-mode upload failed even on a clean build. This mode injects
IDs before uploading and associates maps with the build release. The keyed clean
production build passed and uploaded 69 symbol sets; uploaded application maps were
removed. Next emits one public framework polyfill map after the upload hook; it
contains only Next's standard `polyfill-nomodule.js`, with no application sources.
A local build must
start with a clean `.next` directory when enabling uploads; stale `.next/dev` chunks
are otherwise included by the plugin. Production error deminification still needs
a naturally occurring mapped exception after deployment.

The first independent review's consent regrant and restored-results scenarios were
also reproduced in the shared browser after fixes: withdraw, reload, clear the
active analysis via New analysis, reopen the retained authorized results URL, then
grant. Recording resumed, event/replay ingestion returned HTTP 200, the displayed
analysis's backend consent was restored, and browser identification used its
contact ID even with no active draft. Regression tests also preserve release/debug
IDs, unhandled classification and Firefox/Safari stack frames.
