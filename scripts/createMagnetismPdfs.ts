import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

const downloads = execFileSync("xdg-user-dir", ["DOWNLOAD"], {
  encoding: "utf8",
}).trim();
await mkdir(downloads, { recursive: true });
const green = rgb(0.1, 0.24, 0.2),
  muted = rgb(0.36, 0.44, 0.39),
  light = rgb(0.93, 0.96, 0.88),
  red = rgb(0.76, 0.28, 0.24),
  blue = rgb(0.23, 0.43, 0.65);
async function document(title: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setAuthor("Krito");
  doc.setSubject(
    "Origineel oefenmateriaal over magnetisme voor kinderen van ongeveer 10 jaar",
  );
  const font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  return { doc, font, bold };
}
function page(
  doc: PDFDocument,
  font: PDFFont,
  bold: PDFFont,
  label: string,
  number: number,
) {
  const p = doc.addPage([595.28, 841.89]);
  p.drawRectangle({ x: 0, y: 783, width: 596, height: 59, color: light });
  p.drawText("krito.", { x: 48, y: 804, size: 20, font: bold, color: green });
  p.drawText(label, { x: 124, y: 809, size: 10, font, color: muted });
  p.drawLine({
    start: { x: 48, y: 47 },
    end: { x: 547, y: 47 },
    thickness: 0.6,
    color: rgb(0.82, 0.87, 0.78),
  });
  p.drawText("Magnetisme | ongeveer 10 jaar | origineel testmateriaal", {
    x: 48,
    y: 31,
    size: 8,
    font,
    color: muted,
  });
  p.drawText(String(number), { x: 533, y: 31, size: 9, font, color: muted });
  let y = 750;
  function text(value: string, size = 11, useBold = false, width = 499) {
    const f = useBold ? bold : font,
      words = value.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(next, size) > width && line) {
        p.drawText(line, { x: 48, y, size, font: f, color: green });
        y -= size * 1.5;
        line = word;
      } else line = next;
    }
    if (line) {
      p.drawText(line, { x: 48, y, size, font: f, color: green });
      y -= size * 1.5;
    }
    y -= 7;
    if (y < 65) throw new Error("Page content overflow");
  }
  function heading(t: string) {
    y -= 8;
    text(t, 15, true);
  }
  function space(height = 12) {
    y -= height;
  }
  function lines(count = 2) {
    for (let i = 0; i < count; i++) {
      y -= 19;
      p.drawLine({
        start: { x: 48, y },
        end: { x: 547, y },
        thickness: 0.5,
        color: rgb(0.78, 0.83, 0.76),
      });
    }
    y -= 13;
  }
  function table(
    headers: string[],
    rows: string[][],
    widths: number[],
    rowHeight = 29,
  ) {
    const top = y + 5;
    let x = 48;
    p.drawRectangle({
      x: 48,
      y: top - rowHeight,
      width: 499,
      height: rowHeight,
      color: light,
    });
    headers.forEach((h, i) => {
      p.drawText(h, {
        x: x + 8,
        y: top - 19,
        size: 10,
        font: bold,
        color: green,
      });
      x += widths[i];
    });
    rows.forEach((row, r) => {
      x = 48;
      const rowY = top - rowHeight * (r + 2);
      row.forEach((cell, i) => {
        p.drawText(cell, {
          x: x + 8,
          y: rowY + rowHeight - 19,
          size: 10,
          font,
          color: green,
        });
        x += widths[i];
      });
      p.drawLine({
        start: { x: 48, y: rowY },
        end: { x: 547, y: rowY },
        thickness: 0.5,
        color: rgb(0.82, 0.87, 0.78),
      });
    });
    y = top - rowHeight * (rows.length + 1) - 18;
  }
  function poles(equal: boolean) {
    y -= 12;
    const bottom = y - 40;
    function magnet(x: number, left: string, right: string) {
      p.drawRectangle({
        x,
        y: bottom,
        width: 90,
        height: 35,
        color: left === "N" ? red : blue,
      });
      p.drawRectangle({
        x: x + 90,
        y: bottom,
        width: 90,
        height: 35,
        color: right === "N" ? red : blue,
      });
      p.drawText(left, {
        x: x + 40,
        y: bottom + 11,
        size: 15,
        font: bold,
        color: rgb(1, 1, 1),
      });
      p.drawText(right, {
        x: x + 130,
        y: bottom + 11,
        size: 15,
        font: bold,
        color: rgb(1, 1, 1),
      });
    }
    magnet(48, "N", "Z");
    magnet(365, equal ? "Z" : "N", equal ? "N" : "Z");
    p.drawText(equal ? "<--     -->" : "-->     <--", {
      x: 259,
      y: bottom + 12,
      size: 12,
      font: bold,
      color: green,
    });
    y = bottom - 25;
    text(
      equal
        ? "Gelijke polen stoten elkaar af."
        : "Verschillende polen trekken elkaar aan.",
      10,
    );
  }
  return { p, text, heading, space, lines, table, poles };
}

const lesson = await document("Magnetisme: ontdek de onzichtbare kracht");
{
  const a = page(
    lesson.doc,
    lesson.font,
    lesson.bold,
    "LES | Ontdek de onzichtbare kracht",
    1,
  );
  a.text("Wat doet een magneet?", 25, true);
  a.text(
    "Voor nieuwsgierige onderzoekers van ongeveer 10 jaar. Lesduur: ongeveer 45 minuten.",
    11,
  );
  a.heading("Dit leer je vandaag");
  a.text(
    "Je onderzoekt welke materialen een magneet aantrekt. Je legt uit wat er gebeurt tussen twee magneten. Je voert een eerlijke proef uit en vertelt wat je hebt waargenomen.",
  );
  a.heading("Een kracht die je niet ziet");
  a.text(
    "Houd een magneet dicht bij een stalen paperclip. De paperclip kan naar de magneet bewegen, ook voordat ze elkaar raken. Een magneet oefent dus een kracht uit op afstand. Die kracht noemen we magnetische kracht.",
  );
  a.text(
    "Een magneet trekt bepaalde materialen aan, zoals ijzer en veel soorten staal. Staal bevat ijzer. Maar niet elk metaal wordt aangetrokken: aluminium en koper worden niet op deze manier aangetrokken door een gewone magneet.",
  );
  a.heading("Voorspel, test en kijk goed");
  a.table(
    ["Voorwerp", "Materiaal", "Gewone magneet"],
    [
      ["Stalen paperclip", "Staal", "Trekt aan"],
      ["Ijzeren spijker", "Ijzer", "Trekt aan"],
      ["Houten potlood", "Hout", "Trekt niet aan"],
      ["Plastic dop", "Plastic", "Trekt niet aan"],
      ["Aluminiumfolie", "Aluminium", "Trekt niet aan"],
      ["Koperdraad", "Koper", "Trekt niet aan"],
    ],
    [205, 130, 164],
  );
  a.text(
    "Let op: de naam of de kleur van een voorwerp vertelt niet altijd uit welk materiaal het bestaat. Test het echte voorwerp en schrijf op wat je ziet.",
    10,
  );
  a.heading("Denkvraag");
  a.text(
    "Een voorwerp glanst als metaal. Weet je dan zeker dat een magneet het aantrekt? Leg je antwoord uit.",
  );
}
{
  const a = page(
    lesson.doc,
    lesson.font,
    lesson.bold,
    "LES | Polen en kracht op afstand",
    2,
  );
  a.text("Twee polen, twee reacties", 25, true);
  a.text(
    "Een staafmagneet heeft een noordpool (N) en een zuidpool (Z). In de tekeningen kleuren we N rood en Z blauw; echte magneten kunnen andere kleuren of geen kleur hebben.",
  );
  a.poles(false);
  a.poles(true);
  a.heading("Test met twee magneten");
  a.text(
    "1. Leg twee staafmagneten op tafel. Breng een noordpool langzaam bij een zuidpool. Voel of ze naar elkaar toe willen bewegen.",
  );
  a.text(
    "2. Draai een magneet om. Breng nu twee noordpolen bij elkaar. Voel dat ze van elkaar weg willen bewegen.",
  );
  a.text(
    "3. Probeer ook twee zuidpolen. Beschrijf bij elke proef of er aantrekking of afstoting is.",
  );
  a.heading("Hoe belangrijk is de afstand?");
  a.text(
    "Bij dezelfde magneet en hetzelfde voorwerp is de magnetische werking meestal sterker als ze dichter bij elkaar zijn. Je kunt dit onderzoeken door een paperclip eerst dicht bij en daarna verder van de magneet te leggen.",
  );
  a.text(
    "Verander steeds maar een ding: de afstand. Gebruik dezelfde magneet, dezelfde paperclip en dezelfde ondergrond. Zo kun je je waarnemingen eerlijk vergelijken.",
  );
  a.heading("De onzichtbare omgeving");
  a.text(
    "Rond een magneet is een magnetisch veld. Dat is de omgeving waarin je magnetische werking kunt waarnemen. Een stalen paperclip helpt ons die werking zichtbaar te maken. Je hoeft het veld niet te kunnen zien om het te onderzoeken.",
  );
}
{
  const a = page(
    lesson.doc,
    lesson.font,
    lesson.bold,
    "LES | Onderzoek en toepassingen",
    3,
  );
  a.text("Word een magneetonderzoeker", 25, true);
  a.heading("Onderzoeksvraag");
  a.text(
    "Kan een magneet een stalen paperclip aantrekken door een vel papier heen?",
  );
  a.heading("Je hebt nodig");
  a.text(
    "Een magneet, een stalen paperclip en enkele vellen papier. Werk met gewone schoolmagneten onder begeleiding van de leerkracht.",
  );
  a.heading("Voer de proef uit");
  a.text(
    "1. Voorspel wat er zal gebeuren. Schrijf je voorspelling op voordat je test.",
  );
  a.text(
    "2. Leg een paperclip op een vel papier. Beweeg de magneet vlak onder het papier. Wat doet de paperclip?",
  );
  a.text(
    "3. Herhaal met twee en daarna vier vellen papier. Gebruik dezelfde magneet en paperclip. Houd de magneet steeds even dicht bij het onderste vel.",
  );
  a.text(
    "4. Schrijf je waarnemingen op. Herhaal elke proef. Vertel of de extra dikte verschil maakte.",
  );
  a.text(
    "Een dun vel papier houdt magnetische werking niet zomaar tegen. Extra vellen vergroten wel de afstand. Of de paperclip nog beweegt, hangt onder andere af van de magneet, de afstand en het voorwerp.",
  );
  a.heading("Magneten om ons heen");
  a.text(
    "Een koelkastmagneet houdt een briefje tegen een geschikte stalen deur. Een magnetische sluiting houdt een tas dicht. Een kompas heeft een magnetische naald die zich ongeveer in de noord-zuidrichting richt wanneer er geen storende magneet vlakbij is.",
  );
  a.heading("Vertel wat je hebt geleerd");
  a.text(
    "Een magneet trekt sommige materialen aan, maar niet alle metalen. Verschillende polen trekken aan; gelijke polen stoten af. Magnetische kracht kan op afstand werken. Met een eerlijke proef controleer je jouw voorspelling.",
  );
  a.heading("Exit-ticket");
  a.text(
    "Noem een materiaal dat wordt aangetrokken en een metaal dat niet wordt aangetrokken. Beschrijf daarna een proef die aantoont dat magnetische kracht op afstand werkt.",
  );
}
const exercises = await document("Magnetisme: oefeningen en onderzoek");
{
  const a = page(
    exercises.doc,
    exercises.font,
    exercises.bold,
    "OEFENINGEN | Materialen onderzoeken",
    1,
  );
  a.text("Wat trekt een magneet aan?", 24, true);
  a.text("Naam: __________________________    Datum: __________________");
  a.heading("1. Eerst voorspellen, dan testen");
  a.text(
    "Schrijf ja of nee bij je voorspelling. Test daarna elk voorwerp met dezelfde gewone magneet. Schrijf bij de test wat je werkelijk ziet.",
  );
  a.table(
    ["Voorwerp", "Voorspelling", "Test"],
    [
      ["Stalen paperclip", "________________", "________________"],
      ["Ijzeren spijker", "________________", "________________"],
      ["Houten potlood", "________________", "________________"],
      ["Plastic dop", "________________", "________________"],
      ["Aluminiumfolie", "________________", "________________"],
      ["Koperdraad", "________________", "________________"],
    ],
    [205, 147, 147],
    34,
  );
  a.heading("2. Is alles wat van metaal is magnetisch?");
  a.text(
    "Anna zegt: 'Een magneet trekt alle metalen aan.' Klopt dat? Geef twee voorbeelden die jouw antwoord ondersteunen.",
  );
  a.lines(3);
  a.heading("3. Leg uit wat je ziet");
  a.text(
    "Een paperclip begint te bewegen voordat de magneet hem raakt. Wat vertelt dat over de magnetische kracht?",
  );
  a.lines(2);
}
{
  const a = page(
    exercises.doc,
    exercises.font,
    exercises.bold,
    "OEFENINGEN | Polen, afstand en toepassingen",
    2,
  );
  a.text("Redeneer als een onderzoeker", 24, true);
  a.heading("4. Aantrekken of afstoten?");
  a.table(
    ["Polen dicht bij elkaar", "Wat gebeurt er?"],
    [
      ["Noordpool - zuidpool", "________________________"],
      ["Noordpool - noordpool", "________________________"],
      ["Zuidpool - zuidpool", "________________________"],
    ],
    [280, 219],
  );
  a.heading("5. Een eerlijke proef");
  a.text(
    "Je wilt testen wat de afstand doet. Moet je bij elke proef een andere magneet gebruiken? Waarom wel of niet? Wat houd je hetzelfde?",
  );
  a.lines(2);
  a.heading("6. Papier tussen magneet en paperclip");
  a.text("Voorspelling: _______________________________________________");
  a.table(
    ["Aantal vellen", "Wat zie je bij de paperclip?"],
    [
      ["1 vel", "________________________________"],
      ["2 vellen", "________________________________"],
      ["4 vellen", "________________________________"],
    ],
    [130, 369],
  );
  a.text("Wat besluit je uit jouw echte waarnemingen?", 10);
  a.lines(1);
}
{
  const a = page(
    exercises.doc,
    exercises.font,
    exercises.bold,
    "OEFENINGEN | Je kennis gebruiken",
    3,
  );
  a.text("Wat kun je nu uitleggen?", 24, true);
  a.heading("7. Gebruik je kennis");
  a.text(
    "Een koelkastmagneet blijft hangen aan een stalen deur, maar niet aan een houten kast. Leg uit waarom.",
  );
  a.lines(3);
  a.heading("Vertel het aan een klasgenoot");
  a.text(
    "Leg met je eigen woorden uit hoe je een noordpool en een zuidpool kunt laten aantrekken. Teken de twee magneten en schrijf N en Z op de juiste plaatsen.",
  );
  a.space(100);
  a.heading("Mijn exit-ticket");
  a.text("Dit verraste me tijdens het onderzoek:");
  a.lines(2);
  a.text("Een vraag die ik nog wil onderzoeken:");
  a.lines(2);
}
{
  const a = page(
    exercises.doc,
    exercises.font,
    exercises.bold,
    "LEERKRACHT | Antwoorden en bespreking",
    4,
  );
  a.text("Antwoorden en kijkpunten", 24, true);
  a.text(
    "Deze pagina is bedoeld voor de leerkracht. Bespreek de uitleg en de waarnemingen, niet alleen het juiste woord.",
  );
  a.heading("1. Materialen");
  a.text(
    "Bij de beschreven materialen: stalen paperclip en ijzeren spijker worden aangetrokken. Hout, plastic, aluminium en koper worden niet zo aangetrokken door een gewone magneet. Als een echt voorwerp anders reageert, onderzoek dan of het inderdaad uit het genoemde materiaal bestaat.",
  );
  a.heading("2. Niet alle metalen");
  a.text(
    "Anna heeft geen gelijk. Aluminium en koper zijn metalen die een gewone magneet niet op deze manier aantrekt. Ijzer en veel soorten staal wel. Twee relevante tegenvoorbeelden en een duidelijke uitleg volstaan.",
  );
  a.heading("3. Kracht op afstand");
  a.text(
    "De magneet kan de paperclip aantrekken zonder direct contact. De magnetische kracht werkt dus op afstand.",
  );
  a.heading("4. Polen");
  a.text(
    "N - Z: aantrekken. N - N: afstoten. Z - Z: afstoten. Laat leerlingen hun antwoord met twee staafmagneten controleren.",
  );
  a.heading("5. Eerlijk vergelijken");
  a.text(
    "Gebruik dezelfde magneet, paperclip en ondergrond. Verander alleen de afstand. Met een andere magneet verander je nog een factor; dan weet je niet waardoor een verschil ontstaat.",
  );
  a.heading("6. Papierproef");
  a.text(
    "Vul geen vaste waarnemingen voor de leerling in. Een dun vel papier laat magnetische werking toe, maar extra dikte vergroot de afstand. De uitkomst hangt af van de gebruikte magneet en paperclip. Controleer of de conclusie past bij de echte waarnemingen en of de proef werd herhaald.",
  );
  a.heading("7. Toepassing");
  a.text(
    "De geschikte stalen deur bevat ijzer en wordt door de magneet aangetrokken. Hout wordt niet aangetrokken. Alleen de vorm of kleur van de deur verklaart het verschil niet.",
  );
}
for (const [filename, item] of [
  ["krito-magnetisme-les-10jaar.pdf", lesson],
  ["krito-magnetisme-oefeningen-10jaar.pdf", exercises],
] as const) {
  const target = path.join(downloads, filename);
  const bytes = await item.doc.save();
  await writeFile(target, bytes);
  console.log(
    `${target}: ${item.doc.getPageCount()} pagina’s, ${bytes.length} bytes`,
  );
}
