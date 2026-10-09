import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { assertDevelopment, development } from "./lib";

assertDevelopment();
const convex = new ConvexHttpClient(development.convexUrl);
const token = readFileSync(".secrets/storage-probe-token", "utf8").trim();
const { uploadUrl, downloadUrl, fixture } = await convex.action(api.node.storageSmoke.prepare, { token });
const bytes = Buffer.from(fixture, "base64");
try {
  const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: bytes });
  console.log(`Signed PUT status: ${upload.status}.`);
  if (!upload.ok) throw new Error("Upload failed.");
  const download = await fetch(downloadUrl);
  console.log(`Signed GET status: ${download.status}.`);
  if (!download.ok || !Buffer.from(await download.arrayBuffer()).equals(bytes)) throw new Error("Roundtrip bytes differ.");
  const unsigned = new URL(downloadUrl);
  unsigned.search = "";
  const denied = await fetch(unsigned);
  console.log(`Unsigned GET status: ${denied.status}.`);
  if (denied.ok) throw new Error("Unsigned object request must fail.");
  console.log("Private R2 PDF upload/download matches the fixture; unsigned GET denied.");
} catch {
  throw new Error("Private storage smoke failed; URLs and provider responses withheld.");
}
