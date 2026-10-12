import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { unsubscribeToken, verifyUnsubscribeToken, verifyWebhook } from "../shared/email/signing";

describe("unsubscribe links", () => {
  it("only accept the signature made with the secret", async () => {
    const token = await unsubscribeToken("j57abc123def456ghi", "secret-one");
    expect(await verifyUnsubscribeToken(token, "secret-one")).toBe("j57abc123def456ghi");
    expect(await verifyUnsubscribeToken(token, "secret-two")).toBeNull();
    expect(await verifyUnsubscribeToken(token.replace("j57", "k57"), "secret-one")).toBeNull();
    expect(await verifyUnsubscribeToken("garbage", "secret-one")).toBeNull();
  });
});

describe("Resend webhook signatures (Svix)", () => {
  const key = Buffer.from("a-thirty-two-byte-long-test-key!");
  const secret = `whsec_${key.toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  const now = 1_760_000_000_000;
  const ts = String(now / 1000);
  const body = '{"type":"email.delivered"}';

  it("accepts a valid signature among several", async () => {
    const headers = { id: "msg_1", timestamp: ts, signature: `v1,wrong v1,${sign("msg_1", ts, body)}` };
    expect(await verifyWebhook(headers, body, secret, now)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and old timestamps", async () => {
    const headers = { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` };
    expect(await verifyWebhook(headers, body.replace("delivered", "bounced"), secret, now)).toBe(false);
    expect(await verifyWebhook(headers, body, `whsec_${Buffer.from("other").toString("base64")}`, now)).toBe(false);
    expect(await verifyWebhook(headers, body, secret, now + 10 * 60 * 1000)).toBe(false);
    expect(await verifyWebhook({ ...headers, signature: null }, body, secret, now)).toBe(false);
  });
});
