import { TEMPLATE_IDS, type TemplateId, type Variables } from "./template";
import { materialUrl, trackedLink } from "./variables";

const site = "https://www.krito.be";
const goalSet = { catalogVersion: "1.3", key: "fcf08bbb-f052-420a-915d-5c8536199f70:4da581c3-243a-4300-9b6f-ca2a4f48f355" };
const welcome = (step: number): Variables => ({
  siteLink: trackedLink(site, `welkom-${step}`),
  email: "juf.an@school.be",
  unsubscribeLink: { text: `${site}/uitschrijven?t=voorbeeld`, href: `${site}/uitschrijven?t=voorbeeld` },
});

/** Sample data for previews and tests: every e-mail, with realistic values. */
export const sampleVariables: Record<TemplateId, Variables> = {
  report: {
    topic: "Magnetisme", group: "3de leerjaar", date: "12-10-2026", files: "3 bestanden", goals: "6 leerdoelen",
    covered: 2, partial: 2, notFound: 1, uncertain: 1, reviewGoals: "1 doel",
  },
  reminder: { topic: "Magnetisme", group: "3de leerjaar", materialLink: trackedLink(materialUrl(site, goalSet), "herinnering") },
  "welcome-1-analysis": welcome(1),
  "welcome-1-no-analysis": welcome(1),
  "welcome-2-analysis": welcome(2),
  "welcome-2-no-analysis": {
    ...welcome(2), topic: "Magnetisme", group: "3de leerjaar",
    materialLink: trackedLink(materialUrl(site, goalSet), "welkom-2"),
  },
  "welcome-3": welcome(3),
};
export const sampleIds = TEMPLATE_IDS;
