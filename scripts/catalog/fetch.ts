import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  parseSource,
  SNAPSHOTS_URL,
  convertSource,
} from "../../shared/catalog";

async function get(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Krito-MVP-catalog-import/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  return response.text();
}
export async function fetchCatalog(version?: string): Promise<string> {
  const snapshotsText = await get(SNAPSHOTS_URL);
  const snapshots = JSON.parse(snapshotsText) as {
    results: { $$expanded: { version: string; timestamp: string } }[];
  };
  const available = snapshots.results
    .map((x) => x.$$expanded)
    .filter((x) => /^\d+(\.\d+)+$/.test(x.version));
  available.sort((a, b) => {
    const av = a.version.split(".").map(Number),
      bv = b.version.split(".").map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const delta = (bv[i] ?? 0) - (av[i] ?? 0);
      if (delta) return delta;
    }
    return 0;
  });
  const selected = version
    ? available.find((x) => x.version === version)
    : available[0];
  if (!selected)
    throw new Error(
      "Requested snapshot is not in the source's published snapshot list",
    );
  const url = `${SNAPSHOTS_URL}/${selected.version}/krcItems`;
  const before = await get(`${url}/hash`);
  const raw = await get(url);
  const after = await get(`${url}/hash`);
  if (before !== after)
    throw new Error("Source changed during download; retry later");
  const source = parseSource(JSON.parse(raw));
  if (
    source.version !== selected.version ||
    JSON.parse(before).version !== source.version ||
    Date.parse(source.timestamp) !== Date.parse(selected.timestamp)
  )
    throw new Error("Snapshot metadata mismatch");
  const sourceSha256 = createHash("sha256").update(raw).digest("hex");
  const dataset = convertSource(source, sourceSha256);
  const path = `data/opstap/${source.version}`;
  await mkdir(path, { recursive: true });
  // A published source version is immutable here; changed content needs investigation, never an overwrite.
  let existing: string | undefined;
  try {
    existing = await readFile(`${path}/source.json`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing !== undefined && existing !== raw)
    throw new Error(
      "Source changed within an archived version; archive was preserved",
    );
  await writeFile(`${path}/source.json`, raw);
  await writeFile(`${path}/snapshots.json`, snapshotsText);
  await writeFile(
    `${path}/goals.json`,
    JSON.stringify(dataset, null, 2) + "\n",
  );
  const manifest = {
    version: source.version,
    sourceUrl: url,
    sourceHash: JSON.parse(before).hash,
    sourceSha256,
    fetchedAt: new Date().toISOString(),
    sourceDate: source.startDate,
    snapshotKey: source.snapshotKey,
    timestamp: source.timestamp,
    counts: {
      items: source.items.length,
      goals: dataset.goals.length,
      goalSets: dataset.goalSets.length,
      routes: dataset.routes.length,
      groups: dataset.groups.length,
    },
    typeCounts: dataset.typeCounts,
  };
  await writeFile(
    `${path}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(JSON.stringify(manifest));
  return `${path}/goals.json`;
}
