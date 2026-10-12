/** WebCrypto only: runs in Convex's default runtime, Node and the browser alike. */

const encoder = new TextEncoder();

function toBase64(bytes: ArrayBuffer) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}
const toBase64Url = (bytes: ArrayBuffer) => toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hmac(key: Uint8Array<ArrayBuffer>, message: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
}

/** Constant-time comparison of two strings of public length. */
function same(a: string, b: string) {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return difference === 0;
}

/** An unsubscribe link token: the contact id plus a signature, so links can't be guessed. */
export async function unsubscribeToken(userId: string, secret: string) {
  return `${userId}.${toBase64Url(await hmac(encoder.encode(secret), `unsubscribe:${userId}`))}`;
}

export async function verifyUnsubscribeToken(token: string, secret: string): Promise<string | null> {
  const [userId, signature, extra] = token.split(".");
  if (!userId || !signature || extra !== undefined || !/^[a-z0-9]{10,64}$/.test(userId)) return null;
  const expected = (await unsubscribeToken(userId, secret)).split(".")[1];
  return same(signature, expected) ? userId : null;
}

/**
 * Resend signs webhooks with Svix: HMAC-SHA256 over "id.timestamp.body", keyed
 * with the base64 part of the whsec_ secret. Rejects anything older than 5 minutes.
 */
export async function verifyWebhook(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  secret: string,
  now = Date.now(),
) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret.startsWith("whsec_")) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 5 * 60) return false;
  const expected = toBase64(await hmac(fromBase64(secret.slice(6)), `${id}.${timestamp}.${body}`));
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    return version === "v1" && !!value && same(value, expected);
  });
}
