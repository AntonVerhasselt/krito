import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

type Route = { compute?: string; response?: string; renderingMode?: string };
const manifest = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8")) as {
  routes: Record<string, Route>;
  dynamicRoutes: Record<string, Route>;
};

// Inspect visible HTML, excluding RSC payloads and hidden streamed fragments:
// finding a heading in a script would not prove that visitors can see it.
function visibleNodes(node: DefaultTreeAdapterTypes.Node): DefaultTreeAdapterTypes.Node[] {
  if ("tagName" in node && (
    ["script", "style", "template"].includes(node.tagName) ||
    node.attrs.some((attr) => attr.name === "hidden")
  )) return [];
  return [node, ...("childNodes" in node ? node.childNodes.flatMap(visibleNodes) : [])];
}

const pages = [
  { route: "/", file: "index", heading: "Klopt je les nog met het nieuwe leerplan?", text: "Voor je begint" },
  { route: "/privacy", file: "privacy", heading: "Je gegevens in Krito", text: "Je kiest zelf" },
  { route: "/materiaal", file: "materiaal", heading: "Voeg je lesmateriaal toe", text: "Wat kun je toevoegen?" },
  { route: "/results/demo", file: "results/demo", heading: "Magnetisme", text: "leerdoelen beoordeeld" },
  { route: "/results/demo-loopt", file: "results/demo-loopt", heading: "Magnetisme", text: "Twijfelgevallen worden opnieuw gecontroleerd" },
  { route: "/results/[analysisId]", file: "results/[analysisId]", heading: "Je analyse", text: "Nieuwe analyse" },
];

for (const page of pages) {
  const dynamic = page.route === "/results/[analysisId]";
  const entry = (dynamic ? manifest.dynamicRoutes : manifest.routes)[page.route];
  assert.equal(entry?.compute, "static", `${page.route} must have a static HTML shell`);
  assert.equal(entry?.response, dynamic ? "initial" : "complete", `${page.route} rendering changed`);

  const nodes = visibleNodes(parse(readFileSync(`.next/server/app/${page.file}.html`, "utf8")));
  const text = nodes.filter((node) => node.nodeName === "#text")
    .map((node) => (node as DefaultTreeAdapterTypes.TextNode).value).join(" ");
  const headings = nodes.filter((node) => "tagName" in node && node.tagName === "h1");
  assert.equal(headings.length, 1, `${page.route} must show exactly one heading without JavaScript`);
  assert.ok(text.includes(page.heading), `${page.route} initial heading is missing`);
  assert.ok(text.includes(page.text), `${page.route} initial page content is missing`);
  assert.ok(!/Even laden…|Onderwerp ophalen…|Analyse laden…|Analyse niet beschikbaar/.test(text),
    `${page.route} must not render a loading screen or a premature access error`);
  if (page.route === "/") assert.ok(nodes.some((node) => "attrs" in node &&
    node.attrs.some((attr) => attr.name === "role" && attr.value === "combobox")), "Search input must be in initial HTML");
  if (page.route === "/materiaal") assert.ok(nodes.some((node) => "tagName" in node &&
    node.tagName === "input" && node.attrs.some((attr) => attr.name === "type" && attr.value === "file") &&
    node.attrs.some((attr) => attr.name === "disabled")), "Upload must wait for a validated topic");
  console.log(`Verified ${page.route}: ${dynamic ? "static shell" : "fully static"}, visible heading and content.`);
}
