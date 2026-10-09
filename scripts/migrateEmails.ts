import { assertDevelopment, cli, development } from "./lib";
assertDevelopment();
let cursor: string | null = null,
  moved = 0;
while (true) {
  const result: { cursor: string; done: boolean; moved: number } = JSON.parse(
    cli("npx", [
      "convex",
      "run",
      "migrations:extractEmails",
      JSON.stringify({ cursor }),
      "--deployment",
      development.convexDeployment.slice(4),
    ]),
  );
  moved += result.moved;
  if (result.done) break;
  cursor = result.cursor;
}
const audit = JSON.parse(
  cli("npx", [
    "convex",
    "run",
    "migrations:emailAudit",
    "{}",
    "--deployment",
    development.convexDeployment.slice(4),
  ]),
);
if (audit.legacyEmails || audit.missingProfiles)
  throw new Error("Incomplete email migration");
console.log(
  `Moved ${moved} submitted emails into application user profiles. No email values logged.`,
);
