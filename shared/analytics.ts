/** Metadata only. Never spread application credentials, files or provider payloads. */
export type AnalyticsContext = {
  distinctId: string;
  sessionId: string;
  journeyId: string;
  anonymous: boolean;
  consent: true;
  environment: "local" | "preview" | "hosted";
};

export const ANALYTICS_EVENTS = [
  "analytics_consent_granted", "search_clicked", "search_opened", "search_closed",
  "search_typing_started", "search_query_updated", "search_suggestion_clicked",
  "search_results_loaded", "search_no_results", "search_more_topics_clicked",
  "search_page_changed", "subject_selection_requested", "subject_selected",
  "subject_selection_failed", "subject_change_clicked", "analysis_topic_changed",
  "material_step_viewed", "goal_preview_opened", "goal_preview_closed",
  "goal_preview_page_changed", "goal_clarification_opened", "goal_clarification_closed",
  "analysis_draft_created", "analysis_draft_restored", "upload_picker_opened",
  "upload_files_selected", "upload_selection_rejected", "upload_batch_started",
  "upload_batch_finished", "file_upload_registered", "upload_started",
  "upload_completed", "upload_failed", "file_validation_started",
  "file_conversion_started", "file_conversion_completed", "file_ready",
  "file_validation_failed", "file_remove_clicked", "file_removed", "file_remove_failed",
  "material_ready", "analysis_start_clicked", "email_gate_opened", "email_typing_started",
  "email_validation_failed", "email_gate_closed", "email_submit_requested",
  "email_submit_failed", "user_profile_created", "analysis_submitted", "analysis_started",
  "analysis_preparation_started", "analysis_preparation_completed",
  "analysis_initial_check_started", "analysis_initial_check_completed",
  "analysis_rechecking_started", "analysis_goal_recheck_started",
  "analysis_goal_recheck_completed", "analysis_goal_recheck_failed", "ai_run_retry_scheduled",
  "analysis_completed", "analysis_failed", "analysis_retry_clicked",
  "analysis_retry_requested", "analysis_retry_failed", "workflow_recovery_scheduled",
  "workflow_recovery_exhausted", "analysis_draft_abandoned", "analysis_progress_viewed",
  "analysis_results_viewed", "analysis_completed_results_viewed", "analysis_results_unavailable",
  "result_goal_expanded", "result_goal_collapsed", "result_clarification_opened",
  "result_clarification_closed", "evidence_clicked", "evidence_opened", "evidence_open_failed",
  "analysis_resume_clicked", "analysis_new_clicked", "results_return_to_material_clicked",
  "navigation_link_clicked", "search_cta_clicked", "mobile_menu_opened", "mobile_menu_closed",
  "faq_opened", "faq_closed", "example_goal_expanded", "example_goal_collapsed",
  "official_source_clicked", "external_reference_clicked", "landing_section_viewed",
  "report_download_clicked", "report_download_completed", "report_download_failed",
  "report_generated", "report_generation_failed", "reminder_prompt_viewed", "reminder_gate_opened",
  "reminder_gate_closed", "reminder_submit_requested", "reminder_submit_failed", "reminder_requested",
  "email_link_opened", "email_message_queued", "email_message_sent", "email_message_delivered",
  "email_message_delivery_delayed", "email_message_bounced", "email_message_complained",
  "email_message_failed", "email_message_skipped", "email_message_opened", "email_message_clicked",
  "welcome_sequence_started", "welcome_sequence_completed", "welcome_sequence_stopped",
  "email_unsubscribed",
  "$ai_generation",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

const propertyNames = new Set([
  "event_schema_version", "environment", "backend_environment", "release", "surface", "route_pattern",
  "is_demo", "is_test", "journey_id", "analysis_id", "attempt", "generation", "run_id", "file_id",
  "subject_key", "catalog_version", "goal_count", "group_key", "route_code", "previous_subject_key",
  "interaction_method", "source", "reason", "stage", "error_code", "duration_ms", "total_elapsed_ms",
  "query_length", "word_count", "result_count", "visible_count", "has_more", "position", "page",
  "direction", "suggestion", "had_input", "had_existing_draft", "file_count", "ready_count",
  "preserved_file_count", "bytes", "total_bytes", "page_count", "batch_id", "completed_count",
  "failed_count", "unattempted_count", "extension", "file_kind", "converted", "converted_bytes",
  "goal_id", "verdict", "confidence_bucket", "needs_review", "model", "recheck_count",
  "recheck_completed", "review_count", "covered_count", "partial_count", "not_found_count",
  "uncertain_count", "retry_count", "recovery_count", "fallback_used", "prompt_version",
  "originating_session_id", "evidence_kind", "section_id", "faq_id", "destination", "hostname",
  "was_open", "selected", "restored", "status", "consent_version", "operation", "digest",
  "email_kind", "sequence_step", "email_variant", "is_bot_suspected",
  "$session_id", "$ai_trace_id", "$ai_span_id", "$ai_span_name", "$ai_parent_id", "$ai_model",
  "$ai_provider", "$ai_input_tokens", "$ai_output_tokens", "$ai_cache_read_input_tokens",
  "$ai_reasoning_tokens", "$ai_latency", "$ai_is_error", "$ai_error", "$ai_total_cost_usd",
  "$ai_stream", "$ai_http_status", "$ai_session_id", "$process_person_profile",
]);

export function safeAnalyticsProperties(input: AnalyticsProperties): AnalyticsProperties {
  const result: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(input)) {
    if (!propertyNames.has(key) || value === undefined) continue;
    if (value === null || typeof value === "boolean") result[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    else if (typeof value === "string" && value.length <= 160 &&
      !/@|https?:|[?&=]|[a-f0-9]{64}/i.test(value)) result[key] = value;
  }
  return result;
}

export function routePattern(path: string): string {
  if (path === "/") return "/";
  if (path === "/materiaal") return path;
  if (path === "/privacy") return path;
  if (path === "/uitschrijven") return path;
  if (path === "/results/demo" || path === "/results/demo-loopt") return path;
  if (path.startsWith("/results/")) return "/results/[analysisId]";
  return "/other";
}

const safeCodes = new Set([
  "unavailable", "invalid_topic", "already_submitted", "invalid_email", "personal_email",
  "files_not_ready", "file_too_large", "total_too_large", "invalid_pdf", "unsupported_type",
  "conversion_failed", "conversion_unavailable", "converted_total_too_large", "converted_too_large",
  "encrypted_pdf", "file_size_mismatch", "upload_validation_failed", "preparation_failed",
  "creation_interrupted", "provider_timeout", "provider_credentials", "provider_configuration",
  "request_too_large", "provider_request_rejected", "provider_refusal", "invalid_output",
  "provider_response_unavailable", "provider_transient", "session_storage_unavailable", "upload_failed",
  "popup_blocked", "missing_access", "invalid_capability", "rate_limited", "email_disabled",
  "email_suppressed", "quota_exceeded", "email_provider_error", "report_failed", "invalid_link",
  "monthly_quota_exceeded", "delivery_interrupted",
]);
export function analyticsErrorCode(error: unknown): string {
  const candidate = typeof error === "string" ? error :
    error && typeof error === "object" && "data" in error ? error.data :
    error instanceof Error ? error.message : "";
  return typeof candidate === "string" && safeCodes.has(candidate) ? candidate : "unexpected_error";
}

export function sanitizedError(error: unknown, operation: string): Error {
  const code = analyticsErrorCode(error);
  const safeOperation = /^[a-z_]{1,60}$/.test(operation) ? operation : "application";
  const result = new Error(`${safeOperation}: ${code}`);
  result.name = error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "Error";
  if (error instanceof Error && error.stack) {
    // Keep code locations for source maps, discard the original message and non-frame payloads.
    const frames = error.stack.split("\n").filter((line) =>
      /^\s*at /.test(line) || /^[\w.$<>/ ]*@(?:https?:\/\/|file:|\/|webpack|blob:)/.test(line))
      .map((line) => line.replace(/https?:\/\/[^\s)]+/g, (url) => {
        try { const u = new URL(url); return u.pathname.includes("/_next/static/") ? `${u.origin}${u.pathname}` : "[redacted-url]"; }
        catch { return "[redacted-url]"; }
      }).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]").replace(/[a-f0-9]{64}/gi, "[redacted]"));
    result.stack = `${result.name}: ${result.message}\n${frames.slice(0, 30).join("\n")}`;
  }
  return result;
}
