import { TEMPLATE_IDS, type TemplateId, type Variables } from "./template";
import { materialUrl, trackedLink } from "./variables";
import type { ReportInput } from "../report/model";

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

/** A small report for the sample report e-mail, so the inbox check includes a real pdf. */
export const sampleReportInput: ReportInput = {
  topic: {
    title: "Magnetisme",
    path: [{ title: "Wetenschap en techniek" }, { title: "Natuurkundige verschijnselen" }, { title: "Magnetisme" }],
    group: { title: "3de leerjaar", routeCode: "G", routeTitle: "Gemeenschappelijke doelen" },
    goalCount: 2,
    catalogVersion: "1.3",
  },
  files: [{ fileId: "les", name: "Les magnetisme (voorbeeld).pdf", pageCount: 3, bytes: 240_000 }],
  goals: [
    {
      snapshot: {
        goalId: "3.5.GL3.14",
        wordingText: "De leerlingen kennen de volgende begrippen: het magnetisme, de magnetische kracht.",
        sourceUrl: "https://opstap.katholiekonderwijs.vlaanderen/",
      },
      result: {
        status: "covered",
        confidence: 94,
        confidenceReason: "Beide begrippen worden uitgelegd en gebruikt.",
        explanation: "De les definieert magnetische kracht en laat leerlingen het begrip toepassen.",
        evidence: [{ fileId: "les", page: 1, kind: "text", quote: "Die kracht noemen we magnetische kracht.", description: "Definitie in de les." }],
        missingRequirements: [],
      },
      rechecked: false,
      needsReview: false,
      reviewReason: null,
    },
    {
      snapshot: {
        goalId: "3.5.GL3.18",
        wordingText: "De leerlingen weten dat de aarde een magnetisch veld heeft.",
        sourceUrl: "https://opstap.katholiekonderwijs.vlaanderen/",
      },
      result: {
        status: "partial",
        confidence: 71,
        confidenceReason: "Het kompas komt voor, de uitleg over de aarde ontbreekt.",
        explanation: "Leerlingen gebruiken een kompas, maar nergens staat dat de aarde zelf een magnetisch veld heeft.",
        evidence: [{ fileId: "les", page: 3, kind: "text", quote: "De kompasnaald wijst naar het noorden.", description: "Kompasproef." }],
        missingRequirements: ["Uitleg dat de aarde een magnetisch veld heeft."],
      },
      rechecked: false,
      needsReview: false,
      reviewReason: null,
    },
  ],
  completedAt: Date.UTC(2026, 9, 12, 14, 30),
};

