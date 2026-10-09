import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { convertSource, parseSource, type Dataset } from "../../shared/catalog";
export async function validateCatalog(
  file: string,
): Promise<{ dataset: Dataset; source: ReturnType<typeof parseSource> }> {
  const raw = await readFile(`${dirname(file)}/source.json`, "utf8");
  const source = parseSource(JSON.parse(raw));
  const converted = convertSource(
    source,
    createHash("sha256").update(raw).digest("hex"),
  );
  const dataset = JSON.parse(await readFile(file, "utf8")) as Dataset;
  if (JSON.stringify(converted) !== JSON.stringify(dataset))
    throw new Error(
      "Normalized dataset does not exactly match the archived source conversion",
    );
  const manifest = JSON.parse(
    await readFile(`${dirname(file)}/manifest.json`, "utf8"),
  );
  if (
    manifest.sourceSha256 !== dataset.sourceSha256 ||
    manifest.version !== dataset.catalogVersion ||
    manifest.counts.items !== source.items.length ||
    manifest.counts.goals !== dataset.goals.length ||
    manifest.counts.goalSets !== dataset.goalSets.length
  )
    throw new Error("Manifest does not match source/dataset");
  console.log(
    `Validated Op.stap ${dataset.catalogVersion}: ${source.items.length} source records, ${dataset.goals.length} exact goals, ${dataset.goalSets.length} searchable topic/group combinations.`,
  );
  return { dataset, source };
}
