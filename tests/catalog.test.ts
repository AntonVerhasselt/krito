import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { convertSource, sourceText, type Source } from "../shared/catalog";
import {
  normalizeSearch,
  compareVersions,
  parseCatalogSearch,
  matchesSearchTerms,
} from "../shared/catalogSearch";
const raw = JSON.parse(
  readFileSync("data/opstap/1.3/source.json", "utf8"),
) as Source;
const dataset = convertSource(raw, "fixture-checksum");
const goalItem = raw.items.find((x) => x.type === "KRC_CURRICULUM_GOAL")!;
function changed(change: (source: Source) => void) {
  const copy = structuredClone(raw);
  change(copy);
  return () => convertSource(copy, "fixture-checksum");
}
describe("real Op.stap snapshot conversion", () => {
  it("preserves every source goal's exact wording and separate clarification", () => {
    const originals = new Map(raw.items.map((x) => [x.key, x]));
    expect(dataset.goals).toHaveLength(7488);
    expect(dataset.groups).toHaveLength(32);
    expect(dataset.routes).toHaveLength(7);
    for (const goal of dataset.goals) {
      expect(goal.wording).toBe(originals.get(goal.sourceKey)!.title);
      expect(goal.clarification).toBe(
        originals.get(goal.sourceKey)!.description ?? "",
      );
    }
    expect(dataset.goalSets).toHaveLength(4607);
  });
  it("keeps group identity distinct between G and +, and phases distinct between P and V", () => {
    const groups = dataset.groups.filter((x) => x.code === "L3");
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((x) => x.sourceKey)).size).toBe(2);
    const phases = dataset.groups.filter((x) => x.code === "F3");
    expect(phases.map((x) => x.routeCode).sort()).toEqual(["P", "V"]);
  });
  it("retains all five relation types and admits genuine cluster-free goals", () => {
    expect(
      new Set(dataset.goals.flatMap((g) => Object.keys(g.coherences))).size,
    ).toBe(5);
    expect(dataset.goals.filter((g) => !g.cluster)).toHaveLength(2510);
    for (const topic of dataset.goalSets)
      expect(topic.goalCount).toBe(topic.goalIds.length);
  });
  it("rejects duplicate source identities and official goal codes", () => {
    expect(changed((s) => s.items.push(structuredClone(goalItem)))).toThrow(
      /Duplicate source identity/,
    );
    expect(
      changed((s) => {
        s.items.find(
          (x) => x.type === "KRC_CURRICULUM_GOAL" && x.key !== goalItem.key,
        )!.identifier = goalItem.identifier;
      }),
    ).toThrow(/Duplicate goal code/);
  });
  it("rejects missing wording, unknown routes, conflicting groups, and unresolved relationships", () => {
    expect(
      changed((s) => {
        s.items.find((x) => x.key === goalItem.key)!.title = " ";
      }),
    ).toThrow(/Empty wording/);
    expect(
      changed((s) => {
        s.items.find((x) => x.type === "KRC_GOAL_SET")!.identifier = "UNKNOWN";
      }),
    ).toThrow();
    expect(
      changed((s) => {
        s.items.find((x) => x.key === goalItem.key)!.ageRange = {
          href: "/content/29dff2ad-a533-4ce3-8a3d-5e11912b8e1c",
          title: "jongste kleuter",
        };
      }),
    ).toThrow(/Conflicting route\/group/);
    expect(
      changed((s) => {
        s.items.find((x) => x.key === goalItem.key)!.coherences = {
          after: ["/content/missing"],
        };
      }),
    ).toThrow(/Unresolved reference/);
  });
  it("rejects broken hierarchy rather than silently dropping goals", () => {
    expect(
      changed((s) => {
        s.items.find((x) => x.href === goalItem.parentHref)!.childrenHrefs = [];
      }),
    ).toThrow(/Parent\/child mismatch/);
  });
});
describe("formula-safe source text and search", () => {
  it("preserves mathematical operators and renders fractions unambiguously", () => {
    expect(sourceText("=, ≠, <, >")).toBe("=, ≠, <, >");
    expect(
      sourceText(
        "<span><math><mfrac><mn>3</mn><mn>4</mn></mfrac></math></span>",
      ),
    ).toBe("(3)/(4)");
    expect(sourceText("<math><msup><mi>x</mi><mn>2</mn></msup></math>")).toBe(
      "x^(2)",
    );
    expect(
      sourceText("Voorbeeld<br><ul><li>één &amp; twee</li><li>drie</li></ul>"),
    ).toBe("Voorbeeld\néén & twee\ndrie");
    expect(sourceText("<script>alert(1)</script>tekst")).toBe("tekst");
  });
  it("normalizes search accents without modifying source wording", () => {
    expect(normalizeSearch("Één, TWÉÉ 2.1.GL3.28")).toBe("een twee 2 1 gl3 28");
    expect(compareVersions("1.10", "1.3")).toBeGreaterThan(0);
    expect(compareVersions("1.3", "1.3.0")).toBe(0);
  });
});

describe("teacher search qualifiers", () => {
  it("treats a source year label as a group filter while preserving G/+ route identity", () => {
    expect(
      parseCatalogSearch(
        "breuken 3de leerjaar",
        dataset.groups,
        dataset.routes,
      ),
    ).toEqual({ search: "breuken", groupCode: "L3", routeCode: undefined });
    expect(
      parseCatalogSearch(
        "L3 breuken plusdoelen",
        dataset.groups,
        dataset.routes,
      ),
    ).toEqual({ search: "breuken", groupCode: "L3", routeCode: "+" });
  });
  it("keeps phase and swimming labels as source groups without inventing a year", () => {
    expect(
      parseCatalogSearch(
        "Fase 3 Vlaamse gebarentaal",
        dataset.groups,
        dataset.routes,
      ),
    ).toEqual({ search: "", groupCode: "F3", routeCode: "V" });
    expect(
      parseCatalogSearch("Watergewenners", dataset.groups, dataset.routes)
        .groupCode,
    ).toBe("ZW");
  });
  it("does not misinterpret an official code and requires every keyword", () => {
    expect(
      parseCatalogSearch("2.1.GL3.28", dataset.groups, dataset.routes)
        .groupCode,
    ).toBeUndefined();
    expect(matchesSearchTerms("sociale aandacht", "sociale aan")).toBe(true);
    expect(
      matchesSearchTerms("sociale emotionele ontwikkeling", "sociale aandacht"),
    ).toBe(false);
  });
});
