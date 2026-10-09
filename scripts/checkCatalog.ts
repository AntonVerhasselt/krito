import { assertDevelopment, cli, development } from "./lib";
import { validateCatalog } from "./catalog/validate";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { makeFunctionReference } from "convex/server";
assertDevelopment();
const { dataset } = await validateCatalog("data/opstap/1.3/goals.json");
const db = new ConvexHttpClient(development.convexUrl);
let count = 0;
for (const [type, expected] of Object.entries(dataset.typeCounts)) {
  const result = JSON.parse(
    cli("npx", [
      "convex",
      "run",
      "catalogImport:auditType",
      JSON.stringify({ catalogVersion: dataset.catalogVersion, type }),
      "--deployment",
      development.convexDeployment.slice(4),
      "--codegen",
      "disable",
      "--typecheck",
      "disable",
    ]),
  ) as { count: number };
  if (result.count !== expected)
    throw new Error(`Database/source count mismatch: ${type}`);
  count += result.count;
}
const info = await db.query(api.goals.catalogInfo, {});
if (
  info?.version !== dataset.catalogVersion ||
  info.counts.items !== count ||
  info.counts.goals !== dataset.goals.length
)
  throw new Error("Published catalog metadata mismatch");
const searches = [
  "breuken",
  "sociale aandacht",
  "wiskunde 3de leerjaar",
  "2.1.GL3.28",
  "lichamelijke opvoeding",
  "anderstalige nieuwkomers",
];
for (const search of searches) {
  const result = await db.query(api.goals.listGoalSets, { search });
  if (!result.topics.length && !result.matchingGoals.length)
    throw new Error(`No search results: ${search}`);
  console.log(
    `Search '${search}': ${result.topics.length} topics, ${result.matchingGoals.length} goals`,
  );
}
const exact = await db.query(api.goals.listGoalSets, { search: "2.1.GL3.28" });
if (
  exact.matchingGoals[0]?.goalId !== "2.1.GL3.28" ||
  exact.matchingGoals[0].wording !==
    dataset.goals.find((g) => g.goalId === "2.1.GL3.28")!.wording
)
  throw new Error("Exact code/wording mismatch");
const first = await db.query(api.goals.listGoalSets, { search: "" });
if (!first.more) throw new Error("Expected multiple pages of subjects/groups");
const second = await db.query(api.goals.listGoalSets, {
  search: "",
  cursor: first.cursor,
});
if (second.topics.some((t) => first.topics.some((p) => p.key === t.key)))
  throw new Error("Topic pagination returned duplicates");
const qualified = await db.query(api.goals.listGoalSets, {
  search: "breuken 3de leerjaar",
});
if (
  !qualified.topics.length ||
  qualified.topics.some((t) => t.group.code !== "L3") ||
  qualified.matchingGoals.some((g) => g.group.code !== "L3")
)
  throw new Error("School year qualifier was ignored");
const topic = exact.topics.find(
  (t) => t.group.code === "L3" && t.group.routeCode === "G",
)!;
const goals = await db.query(api.goals.listGoals, {
  catalogVersion: dataset.catalogVersion,
  goalSetKey: topic.key,
});
const chosen = await db.query(api.goals.getGoalSet, {
  catalogVersion: dataset.catalogVersion,
  key: topic.key,
});
if (!chosen || chosen.level !== "subdomain" || chosen.goalCount !== goals.total)
  throw new Error("Subdomain selection did not include the complete goal set");
if (!goals.goals.some((g) => g.goalId === "2.1.GL3.28"))
  throw new Error("Goal missing from actual hierarchy/group");
try {
  await db.mutation(
    makeFunctionReference<"mutation">("catalogImport:publish"),
    {
      catalogVersion: dataset.catalogVersion,
      datasetSha256: "unauthorized-test",
    },
  );
  throw new Error("Internal import unexpectedly public");
} catch (error) {
  if (
    !(error instanceof Error) ||
    !error.message.includes("Could not find public function")
  )
    throw error;
}
console.log(
  `Verified all ${count} source records in Convex by type, published exact goals, search, pagination, and private import functions.`,
);
