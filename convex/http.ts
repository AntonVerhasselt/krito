import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { verifyWebhook } from "../shared/email/signing";

const http = httpRouter();

/** Delivery, bounce, complaint, open and click events from Resend (signed with Svix). */
http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    const valid = await verifyWebhook(
      {
        id: request.headers.get("svix-id"),
        timestamp: request.headers.get("svix-timestamp"),
        signature: request.headers.get("svix-signature"),
      },
      body,
      secret,
    );
    if (!valid) return new Response("Invalid signature", { status: 401 });
    let event: { type?: unknown; created_at?: unknown; data?: { email_id?: unknown; bounce?: { type?: unknown } } };
    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid body", { status: 400 });
    }
    const providerId = event.data?.email_id;
    if (typeof event.type !== "string" || typeof providerId !== "string") return new Response(null, { status: 204 });
    const parsed = typeof event.created_at === "string" ? Date.parse(event.created_at) : NaN;
    const at = Number.isFinite(parsed) ? parsed : Date.now();
    const bounceType = event.data?.bounce?.type;
    const result = await ctx.runMutation(internal.emails.recordEvent, {
      // The signature check above guarantees the svix-id header is present.
      eventId: request.headers.get("svix-id")!,
      type: event.type,
      providerId,
      at,
      ...(typeof bounceType === "string" ? { bounceType } : {}),
    });
    // An event can arrive before the send result is stored: ask Resend to retry
    // it for a while. Older unknown events belong to samples or other deployments.
    if (result === "unknown" && Date.now() - at < 10 * 60 * 1000) return new Response("Unknown email", { status: 409 });
    return new Response(null, { status: 204 });
  }),
});

/** RFC 8058 one-click unsubscribe from the List-Unsubscribe header. GET never unsubscribes. */
http.route({
  path: "/unsubscribe",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get("t") ?? "";
    const ok = await ctx.runMutation(internal.emails.unsubscribeOneClick, { token });
    return new Response(ok ? "Uitgeschreven" : "Ongeldige link", { status: ok ? 200 : 400 });
  }),
});

export default http;
