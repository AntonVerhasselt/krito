import { parseArgs } from "node:util";
import { assertDevelopment, cli, development } from "./lib";
import { validateCatalog } from "./catalog/validate";
import { digest } from "../shared/catalog";
const { values } = parseArgs({
  options: { env: { type: "string" }, file: { type: "string" } },
});
if (values.env !== "dev" || !values.file)
  throw new Error(
    "Usage: npm run goals:seed -- --env dev --file data/opstap/<version>/goals.json",
  );
assertDevelopment();
const { dataset, source } = await validateCatalog(values.file);
const { goals, goalSets, ...metadata } = dataset;
const expected = {
  items: source.items.length,
  goals: goals.length,
  goalSets: goalSets.length,
};
function run(name: string, args: unknown): { status?: string } {
  return JSON.parse(
    cli("npx", [
      "convex",
      "run",
      `catalogImport:${name}`,
      JSON.stringify(args),
      "--deployment",
      development.convexDeployment.slice(4),
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ]),
  );
}
const datasetSha256 = await digest(dataset);
const started = run("begin", { ...metadata, datasetSha256, expected });
if (started.status === "published") {
  console.log("This exact version is already published; nothing changed.");
  process.exit(0);
}
const itemRows = source.items.map((item) => ({
  catalogVersion: dataset.catalogVersion,
  sourceKey: item.key,
  sourceHref: item.href,
  type: item.type,
  ...(item.parentHref
    ? { parentKey: item.parentHref.slice("/content/".length) }
    : {}),
  source: item,
}));
for (const [kind, rows] of [
  ["items", itemRows],
  ["goals", goals],
  ["goalSets", goalSets],
] as const) {
  // Linux limits a single argv string to 128KiB; use small, deterministic batches.
  const batches: unknown[][] = [];
  let current: unknown[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row));
    if (current.length && (current.length >= 100 || bytes + size > 80_000)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += size;
  }
  if (current.length) batches.push(current);
  console.log(
    `Importing ${rows.length} ${kind} into ${development.convexDeployment} (${batches.length} batches).`,
  );
  for (let i = 0; i < batches.length; i++) {
    const args = { catalogVersion: dataset.catalogVersion, rows: batches[i] };
    run("ingest", { ...args, kind });
    if ((i + 1) % 20 === 0 || i === batches.length - 1)
      console.log(
        `${kind}: ${i + 1}/${batches.length} batches imported and verified`,
      );
  }
}
console.log(
  JSON.stringify(
    run("publish", { catalogVersion: dataset.catalogVersion, datasetSha256 }),
  ),
);
