"use node";
import { v } from "convex/values";
import { Resend, type Attachment } from "resend";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { FunctionReturnType } from "convex/server";
import { emailContent } from "../../shared/email/content.generated";
import { PHOTO_CONTENT_ID, renderTemplate, TEMPLATE_IDS, type TemplateId, type Variables } from "../../shared/email/template";
import { materialUrl, reportVariables, trackedLink } from "../../shared/email/variables";
import { sampleReportInput, sampleVariables } from "../../shared/email/samples";
import { unsubscribeToken } from "../../shared/email/signing";
import { antonPhotoJpeg } from "../../shared/email/photo.generated";
import { buildReportModel, type ReportInput } from "../../shared/report/model";
import { renderReport } from "../../shared/report/render";

type Delivery = NonNullable<FunctionReturnType<typeof internal.emails.loadDelivery>>;
type Composed = { template: TemplateId; vars: Variables; attachments: Attachment[]; unsubscribe?: string };

function config() {
  const site = process.env.SITE_URL ?? "https://www.krito.be";
  return {
    mode: process.env.EMAIL_MODE ?? "off",
    allowlist: new Set((process.env.EMAIL_ALLOWLIST ?? "").split(",").map((a) => a.trim().toLowerCase()).filter(Boolean)),
    from: process.env.EMAIL_FROM ?? "Anton van Krito <anton@mail.krito.be>",
    replyTo: process.env.EMAIL_REPLY_TO,
    site,
    secret: process.env.EMAIL_LINK_SECRET,
    apiKey: process.env.RESEND_API_KEY,
  };
}

/** Why this e-mail must not go out, or null. EMAIL_MODE keeps tests from reaching real teachers. */
function skipReason(d: Delivery, c: ReturnType<typeof config>) {
  if (c.mode !== "live" && !(c.mode === "allowlist" && c.allowlist.has(d.user.email.trim().toLowerCase())))
    return "email_disabled";
  if (d.user.suppressed) return "email_suppressed";
  if (d.message.kind === "welcome" && (d.user.unsubscribed || !d.user.welcomeActive)) return "unsubscribed";
  return null;
}

async function unsubscribeLinks(userId: string, c: ReturnType<typeof config>) {
  if (!c.secret) throw new Error("email_configuration");
  const token = encodeURIComponent(await unsubscribeToken(userId, c.secret));
  return {
    page: `${new URL("/uitschrijven", c.site)}?t=${token}`,
    oneClick: `${process.env.CONVEX_SITE_URL}/unsubscribe?t=${token}`,
  };
}

const photo: Attachment = {
  filename: "anton-en-charlotte.jpg",
  content: Buffer.from(antonPhotoJpeg, "base64"),
  contentType: "image/jpeg",
  contentId: PHOTO_CONTENT_ID,
};

async function reportEmail(input: ReportInput): Promise<Composed> {
  const pdf = await renderReport(input);
  return {
    template: "report",
    vars: reportVariables(buildReportModel(input)),
    attachments: [{ filename: pdf.fileName, content: Buffer.from(pdf.bytes), contentType: "application/pdf" }],
  };
}

async function compose(d: Delivery, c: ReturnType<typeof config>): Promise<Composed> {
  const { message, user } = d;
  if (message.kind === "report") {
    if (!d.report) throw new Error("report_unavailable");
    return await reportEmail(d.report);
  }
  if (message.kind === "reminder") {
    if (!message.goalSet || !d.topic) throw new Error("invalid_topic");
    return {
      template: "reminder",
      vars: { topic: d.topic.title, group: d.topic.group, materialLink: trackedLink(materialUrl(c.site, message.goalSet), "herinnering") },
      attachments: [],
    };
  }
  const step = message.step ?? 1;
  const links = await unsubscribeLinks(message.userId, c);
  const vars: Variables = {
    siteLink: trackedLink(new URL("/", c.site).toString(), `welkom-${step}`),
    email: user.email,
    unsubscribeLink: { text: links.page, href: links.page },
  };
  // A retry keeps the variant chosen at the first attempt, so it sends the same e-mail.
  const template: TemplateId =
    (message.template as TemplateId | undefined) ??
    (step === 3 ? "welcome-3" : (`welcome-${step}-${d.hasCompletedAnalysis ? "analysis" : "no-analysis"}` as TemplateId));
  if (template === "welcome-2-no-analysis" && d.reminder?.topic)
    Object.assign(vars, {
      topic: d.reminder.topic.title,
      group: d.reminder.topic.group,
      materialLink: trackedLink(materialUrl(c.site, d.reminder.goalSet), "welkom-2"),
    });
  return { template, vars, attachments: [], unsubscribe: links.oneClick };
}

type SendResult = { ok: true; id: string } | { ok: false; code: string; retry: boolean };

async function send(
  c: ReturnType<typeof config>,
  to: string,
  composed: Composed,
  idempotencyKey: string,
  tags: { name: string; value: string }[],
): Promise<SendResult> {
  if (!c.apiKey) return { ok: false, code: "email_configuration", retry: false };
  const email = renderTemplate(emailContent[composed.template], composed.vars);
  const resend = new Resend(c.apiKey);
  try {
    const { data, error } = await resend.emails.send(
      {
        from: c.from,
        to: [to],
        ...(c.replyTo ? { replyTo: c.replyTo } : {}),
        subject: email.subject,
        text: email.text,
        html: email.html,
        attachments: [...composed.attachments, ...(email.photo ? [photo] : [])],
        tags,
        ...(composed.unsubscribe
          ? { headers: { "List-Unsubscribe": `<${composed.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      },
      { idempotencyKey },
    );
    if (data) return { ok: true, id: data.id };
    // The daily quota resets at midnight UTC; the monthly one needs a plan change.
    if (error.name === "daily_quota_exceeded") return { ok: false, code: "quota_exceeded", retry: true };
    if (error.name === "monthly_quota_exceeded") return { ok: false, code: "monthly_quota_exceeded", retry: false };
    const transient =
      error.name === "rate_limit_exceeded" || error.name === "concurrent_idempotent_requests" ||
      error.statusCode === null || error.statusCode === 429 || error.statusCode >= 500;
    return { ok: false, code: "email_provider_error", retry: transient };
  } catch {
    // Network trouble: the idempotency key makes a retry safe.
    return { ok: false, code: "email_provider_error", retry: true };
  }
}

/** Sends one recorded e-mail. Scheduled by enqueueEmail; never stores the content. */
export const deliver = internalAction({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, { messageId }): Promise<null> => {
    const attempt: number | null = await ctx.runMutation(internal.emails.claim, { messageId });
    if (attempt === null) return null;
    const own = { messageId, attempt };
    try {
      const d: Delivery | null = await ctx.runQuery(internal.emails.loadDelivery, { messageId });
      if (!d) return await ctx.runMutation(internal.emails.markFailed, { ...own, errorCode: "not_found" });
      const c = config();
      const reason = skipReason(d, c);
      if (reason) return await ctx.runMutation(internal.emails.markSkipped, { ...own, reason });
      let composed: Composed;
      try {
        composed = await compose(d, c);
      } catch (e) {
        const code = e instanceof Error && /^[a-z_]+$/.test(e.message) ? e.message : "report_failed";
        console.error(JSON.stringify({ operation: "email_compose", messageId, code }));
        return await ctx.runMutation(internal.emails.markFailed, { ...own, errorCode: code });
      }
      if (!d.message.template) await ctx.runMutation(internal.emails.noteTemplate, { ...own, template: composed.template });
      const result = await send(c, d.user.email, composed, `krito-${messageId}`, [
        { name: "kind", value: d.message.kind },
        ...(d.message.step ? [{ name: "step", value: String(d.message.step) }] : []),
      ]);
      if (result.ok)
        return await ctx.runMutation(internal.emails.markSent, { ...own, providerId: result.id, template: composed.template });
      console.error(JSON.stringify({ operation: "email_send", messageId, code: result.code, retry: result.retry }));
      return await ctx.runMutation(result.retry ? internal.emails.markRetry : internal.emails.markFailed, {
        ...own,
        errorCode: result.code,
      });
    } catch {
      // Anything unexpected (a failed query, a bookkeeping error) is retried;
      // if even this fails, the recovery cron picks the message up.
      console.error(JSON.stringify({ operation: "email_deliver", messageId, code: "delivery_interrupted" }));
      return await ctx.runMutation(internal.emails.markRetry, { ...own, errorCode: "delivery_interrupted" });
    }
  },
});

/**
 * Sends every e-mail, with sample data, to one allowlisted address: the inbox
 * check for copy changes. `npx convex run node/email:sendSamples '{"to":"…"}'`
 */
export const sendSamples = internalAction({
  args: { to: v.string(), only: v.optional(v.string()) },
  handler: async (_ctx, { to, only }) => {
    const c = config();
    if (!c.allowlist.has(to.trim().toLowerCase())) throw new Error("Add the address to EMAIL_ALLOWLIST first.");
    const results: Record<string, string> = {};
    const runId = Date.now();
    for (const template of TEMPLATE_IDS) {
      if (only && template !== only) continue;
      const composed =
        template === "report"
          ? await reportEmail(sampleReportInput)
          : { template, vars: sampleVariables[template], attachments: [] };
      const result = await send(c, to, composed, `krito-sample-${runId}-${template}`, [{ name: "kind", value: "sample" }]);
      results[template] = result.ok ? `sent ${result.id}` : `failed ${result.code}`;
    }
    return results;
  },
});
