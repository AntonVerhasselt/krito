import { Suspense } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Providers } from "../src/app/providers";
import { TopicPicker } from "../src/components/TopicPicker";
import { MaterialStep } from "../src/components/MaterialStep";
import { AnalysisResults, DemoResults } from "../src/components/AnalysisResults";
import { ResultsShell } from "../src/components/ResultsShell";
import { ResultsPending } from "../src/components/ResultsPending";

const route = vi.hoisted(() => ({ analysisId: "", suspend: false }));

vi.mock("next/navigation", () => ({
  useParams: () => {
    if (route.suspend) throw new Promise(() => {});
    return { analysisId: route.analysisId };
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  route.analysisId = "";
  route.suspend = false;
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://prerender-test.convex.cloud");
  // Next.js Cache Components rejects randomness during prerendering.
  vi.spyOn(Math, "random").mockImplementation(() => {
    throw new Error("Randomness cannot run during prerendering.");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("renders landing content and the search input before JavaScript or backend data arrives", () => {
  // Cache Components rejects randomness during prerendering. Exercise the real
  // provider and search to catch third-party initialization that breaks the shell.
  const html = renderToString(
    <Suspense fallback={<p>Even laden…</p>}>
      <Providers>
        <h1>Klopt je les nog met het nieuwe leerplan?</h1>
        <TopicPicker />
      </Providers>
    </Suspense>,
  );

  expect(html).toContain("<h1>Klopt je les nog met het nieuwe leerplan?</h1>");
  expect(html).toContain('role="combobox"');
  expect(html).not.toContain("Even laden…");
});

it("renders the material form before browser selection and backend data arrive", () => {
  const html = renderToString(<Providers><MaterialStep /></Providers>);
  expect(html).toContain("Voeg je lesmateriaal toe");
  expect(html).toContain("Wat kun je toevoegen?");
  expect(html).toContain("Start de analyse");
  expect(html).toMatch(/type="file"[^>]*disabled=""/);
  expect(html).not.toContain("Onderwerp ophalen…");
});

it.each([false, true])("renders results navigation and content while waiting for a session or route (suspend=%s)", (suspend) => {
  route.analysisId = "private-analysis";
  route.suspend = suspend;
  const html = renderToString(
    <Providers>
      <ResultsShell>
        <Suspense fallback={<ResultsPending />}><AnalysisResults /></Suspense>
      </ResultsShell>
    </Providers>,
  );
  expect(html).toContain("Krito startpagina");
  expect(html).toContain("Nieuwe analyse");
  expect(html).toContain("<h1>Je analyse</h1>");
  expect(html).not.toContain("Analyse niet beschikbaar");
  expect(html).not.toContain("Analyse laden…");
});

it.each(["demo", "demo-loopt"])("renders %s results before JavaScript loads", (analysisId) => {
  route.analysisId = analysisId;
  const html = renderToString(<Providers><DemoResults running={analysisId === "demo-loopt"} /></Providers>);
  expect(html).toContain("Magnetisme");
  expect(html).toContain('aria-label="Samenvatting"');
  expect(html).not.toContain("Analyse laden…");
});
