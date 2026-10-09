"use client";
import { GoalList, type ListGoal } from "./GoalList";

// Real Op.stap goals (Magnetisme, 3de leerjaar) with an example assessment of
// a magnetism lesson and exercise bundle. Shown on the homepage as a sample.
const files = [
  { fileId: "les", name: "Les magnetisme.pptx" },
  { fileId: "oef", name: "Oefenbundel magnetisme.docx" },
];
const goals: ListGoal[] = [
  {
    goalId: "3.5.GL3.14",
    wording:
      "De leerlingen kennen de volgende begrippen: het magnetisme, de magnetische kracht.",
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
      ],
      missingRequirements: [],
    },
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
  },
];

export function ResultsDemo() {
  return (
    <div className="results-demo">
      <GoalList goals={goals} phase="completed" files={files} />
    </div>
  );
}
