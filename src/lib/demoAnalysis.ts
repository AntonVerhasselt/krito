import type { ListGoal } from "../components/GoalList";

// Real Op.stap goals (Magnetisme, 3de leerjaar) with an example assessment of
// a magnetism lesson and exercise bundle. Used for the homepage sample and the
// /results/demo preview; no analysis is run.
export const demoFiles = [
  { fileId: "les", name: "Les magnetisme.pptx" },
  { fileId: "oef", name: "Oefenbundel magnetisme.docx" },
  { fileId: "toets", name: "Toets krachten en magneten.pdf" },
];

export const demoTopic = {
  title: "Magnetisme",
  path: [
    { title: "Wetenschap en techniek" },
    { title: "Natuurkundige verschijnselen" },
    { title: "Magnetisme" },
  ],
  group: {
    title: "3de leerjaar",
    routeCode: "G",
    routeTitle: "Gemeenschappelijke doelen",
  },
  goalCount: 6,
  catalogVersion: "1.3",
};

export const demoGoals: ListGoal[] = [
  {
    goalId: "3.5.GL3.14",
    wording:
      "De leerlingen kennen de volgende begrippen: het magnetisme, de magnetische kracht.",
    clarification:
      "<strong>Voorbeeld(en):</strong> De leerlingen zien dat een magneet een paperclip kan optillen zonder contact: krachtwerking op afstand.",
    result: {
      status: "covered",
      confidence: 96,
      confidenceReason:
        "Beide begrippen worden uitgelegd en daarna in een oefening gebruikt.",
      explanation:
        "Dia 3 introduceert magnetisme en magnetische kracht met een eigen definitie; oefening 1 laat leerlingen de begrippen toepassen.",
      evidence: [
        {
          fileId: "les",
          page: 3,
          kind: "text",
          quote: "Een magneet oefent een kracht uit: de magnetische kracht.",
          description: "Definitie in de lespresentatie.",
        },
        {
          fileId: "oef",
          page: 1,
          kind: "text",
          quote:
            "Vul aan: een magneet trekt een paperclip aan zonder hem te ...",
          description: "Toepassingsvraag over kracht op afstand.",
        },
      ],
      missingRequirements: [],
    },
    modelUsed: "gpt-6-luna",
  },
  {
    goalId: "3.5.GL3.15",
    wording: "De leerlingen kennen het volgende begrip: het magnetisch veld.",
    result: {
      status: "uncertain",
      confidence: 52,
      confidenceReason:
        "Er staat een tekening met veldlijnen, maar het begrip wordt nergens benoemd.",
      explanation:
        "Op pagina 4 van de oefenbundel staat ijzervijlsel rond een staafmagneet. Het is niet duidelijk of de les het begrip ‘magnetisch veld’ ook uitlegt.",
      evidence: [
        {
          fileId: "oef",
          page: 4,
          kind: "visual",
          quote: null,
          description: "Foto van ijzervijlsel rond een staafmagneet.",
        },
      ],
      missingRequirements: ["Het begrip ‘magnetisch veld’ expliciet benoemen"],
    },
    modelUsed: "gpt-6.1-sol",
    needsReview: true,
    reviewReason: "still_uncertain",
  },
  {
    goalId: "3.5.GL3.16",
    wording:
      "De leerlingen weten dat tegenovergestelde polen elkaar aantrekken en gelijke polen elkaar afstoten.",
    result: {
      status: "covered",
      confidence: 94,
      confidenceReason: "Proef en verwerkingsvraag sluiten op elkaar aan.",
      explanation:
        "De les laat twee staafmagneten tegen elkaar houden en de oefenbundel vraagt leerlingen te voorspellen wat er gebeurt.",
      evidence: [
        {
          fileId: "oef",
          page: 2,
          kind: "visual",
          quote: null,
          description: "Tekening van twee magneten met N- en Z-pool.",
        },
      ],
      missingRequirements: [],
    },
    modelUsed: "gpt-6-luna",
  },
  {
    goalId: "3.5.GL3.17",
    wording:
      "De leerlingen kennen magnetisme: polen, noordpool, zuidpool, magnetische kracht; aarde als magneet.",
    result: {
      status: "partial",
      confidence: 78,
      confidenceReason: "De polen komen aan bod; de aarde als magneet niet.",
      explanation:
        "Noordpool, zuidpool en magnetische kracht worden uitgelegd en getoetst. Dat de aarde zich als een magneet gedraagt, ontbreekt.",
      evidence: [
        {
          fileId: "toets",
          page: 1,
          kind: "text",
          quote: "Duid de noordpool en de zuidpool aan op de magneet.",
          description: "Toetsvraag 2.",
        },
      ],
      missingRequirements: ["De aarde als magneet"],
    },
    modelUsed: "gpt-6-luna",
  },
  {
    goalId: "3.5.GL3.18",
    wording: "De leerlingen weten dat de aarde een magnetisch veld heeft.",
    result: {
      status: "partial",
      confidence: 81,
      confidenceReason:
        "Het kompas komt aan bod, maar de link met de aarde blijft impliciet.",
      explanation:
        "Leerlingen gebruiken een kompas, maar nergens wordt uitgelegd dat de naald draait door het magnetisch veld van de aarde.",
      evidence: [
        {
          fileId: "les",
          page: 6,
          kind: "text",
          quote: "De kompasnaald wijst altijd naar het noorden.",
          description: "Enige vermelding van het kompas.",
        },
      ],
      missingRequirements: [
        "Uitleg dat de aarde zelf een magnetisch veld heeft",
      ],
    },
    modelUsed: "gpt-6-luna",
  },
  {
    goalId: "3.5.GL3.19",
    wording:
      "De leerlingen kunnen met een magneet en een kompas aantonen dat een magneet een kracht uitoefent op afstand door de richting van de kompasnaald te laten veranderen.",
    result: {
      status: "not_found",
      confidence: 88,
      confidenceReason: "Geen proef met magneet én kompas in het materiaal.",
      explanation:
        "Het materiaal bevat geen opdracht waarin leerlingen zelf de kompasnaald laten afwijken met een magneet.",
      evidence: [],
      missingRequirements: [
        "Een proef waarin leerlingen een magneet bij een kompas brengen",
        "Een vraag naar wat er met de kompasnaald gebeurt",
      ],
    },
    modelUsed: "gpt-6-luna",
  },
];

/** The same analysis while the second check is still running. */
export const demoGoalsRunning: ListGoal[] = demoGoals.map((g, i) =>
  i === 1 || i === 3
    ? { ...g, result: null, modelUsed: null, needsReview: false }
    : g,
);
