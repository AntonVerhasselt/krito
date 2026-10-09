import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { assertDevelopment, cli, development } from "../../scripts/lib";
import { randomBytes } from "node:crypto";
test.skip(
  process.env.KRITO_E2E_DEVELOPMENT !== "1",
  "Requires the explicitly selected development backend and private R2.",
);
function internalCall(name: string, args: unknown) {
  const output = cli("npx", [
    "convex",
    "run",
    name,
    JSON.stringify(args),
    "--deployment",
    development.convexDeployment.slice(4),
  ]);
  return output.trim() ? JSON.parse(output) : undefined;
}
for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`private multiple-PDF flow ${viewport.width}px`, async ({ page }) => {
    assertDevelopment();
    await page.setViewportSize(viewport);
    const downloads = execFileSync("xdg-user-dir", ["DOWNLOAD"], {
      encoding: "utf8",
    }).trim();
    const pdfs = [
      `${downloads}/krito-magnetisme-les-10jaar.pdf`,
      `${downloads}/krito-magnetisme-oefeningen-10jaar.pdf`,
    ];
    let analysisId: string | undefined;
    try {
      await page.goto("/");
      await page.getByRole("combobox").fill("breuken 3de leerjaar");
      await page
        .getByRole("option")
        .filter({ hasText: "Positieve rationale getallen" })
        .click();
      await expect(
        page.getByText("Alle 11 bijbehorende leerdoelen worden gecontroleerd."),
      ).toBeVisible();
      await page.locator('input[type="file"]').setInputFiles(pdfs);
      await expect(page.getByText("3 pagina’s · Klaar")).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText("4 pagina’s · Klaar")).toBeVisible({
        timeout: 60_000,
      });
      const credentials = await page.evaluate(() =>
        JSON.parse(sessionStorage.getItem("krito-active-analysis")!),
      );
      analysisId = credentials.analysisId;
      internalCall("testHarness:markFixture", {
        analysisId,
        deterministic: true,
      });
      expect(
        internalCall("testHarness:audit", { analysisId }).runs,
      ).toHaveLength(0);
      await page.reload();
      await expect(page.getByText("3 pagina’s · Klaar")).toBeVisible();
      await page
        .getByRole("button", { name: "Analyseer mijn materiaal" })
        .click();
      await page
        .getByLabel("Je e-mailadres")
        .fill("playwright.fixture+private@example.com");
      await page.getByRole("button", { name: "Start de analyse" }).click();
      await expect(page).toHaveURL(new RegExp(`/results/${analysisId}$`));
      await page.reload();
      await expect(page.locator(".results-summary")).toBeVisible({
        timeout: 240_000,
      });
      await expect(page.locator(".result-card")).toHaveCount(11);
      await page
        .locator(".result-card")
        .first()
        .locator("summary")
        .first()
        .click();
      await expect(
        page
          .locator(".result-card")
          .first()
          .getByText("Zekerheid van beoordeling: 88/100"),
      ).toBeVisible();
      await expect(
        page
          .locator(".result-card")
          .first()
          .getByText(
            "Deze verwijzingen en citaten zijn door het model gemaakt.",
            { exact: false },
          ),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Nakijken nodig", exact: true })
        .click();
      await expect(page.locator(".result-card")).toHaveCount(1);
      const client = new ConvexHttpClient(development.convexUrl);
      expect(
        await client.query(api.analyses.getResults, {
          analysisId: analysisId!,
          accessToken: randomBytes(32).toString("hex"),
        }),
      ).toBeNull();
      expect(
        JSON.stringify(
          await client.query(api.analyses.getResults, credentials),
        ),
      ).not.toContain("playwright.fixture+private@example.com");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.evaluate(
        (id) => sessionStorage.removeItem(`krito-access-${id}`),
        analysisId,
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Analyse niet beschikbaar" }),
      ).toBeVisible();
    } finally {
      if (analysisId) internalCall("testHarness:cleanup", { analysisId });
    }
  });
}
