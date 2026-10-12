import { Document, Font, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import * as fonts from "./fonts.generated";
import { VERDICTS, verdictLabels, type ReportGoal, type ReportModel, type Verdict } from "./model";

// The site's palette (globals.css): ink on white paper, verdicts in pen colours.
const c = {
  ink: "#1d2422",
  soft: "#505a56",
  faint: "#6b7471",
  rule: "#c9d1ce",
  ruleSoft: "#e5e9e7",
  paper2: "#f7f8f7",
  pen: "#0b7546",
  marker: "#cdebd7",
};
const verdictColor: Record<Verdict, string> = {
  covered: "#0b7546",
  partial: "#87620f",
  not_found: "#a63d2c",
  uncertain: "#5b636a",
};

/** Footer geometry, shared with the page numbers stamped in render.tsx. */
export const FOOTER = { size: 7.5, side: 48, bottom: 26, baseline: 28.4, counterWidth: 80 };
/** Symbols the text fonts lack (∥ ⊥ ∦ appear in real goals) come from Noto Sans Math. */
const ui = ["UI", "Math"];
const doc = ["Doc", "Math"];

let registered = false;
function registerFonts() {
  if (registered) return;
  registered = true;
  const src = (data: string) => `data:font/ttf;base64,${data}`;
  Font.register({
    family: "UI",
    fonts: [
      { src: src(fonts.uiRegular), fontWeight: 400 },
      { src: src(fonts.uiSemiBold), fontWeight: 600 },
      { src: src(fonts.uiBold), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Doc",
    fonts: [
      { src: src(fonts.docRegular), fontStyle: "normal" },
      { src: src(fonts.docItalic), fontStyle: "italic" },
    ],
  });
  Font.register({ family: "Hand", src: src(fonts.hand) });
  // One upright face stands in for every weight and style the text fonts use.
  const math = src(fonts.math);
  Font.register({
    family: "Math",
    fonts: [400, 600, 700].flatMap((fontWeight) =>
      (["normal", "italic"] as const).map((fontStyle) => ({ src: math, fontWeight, fontStyle })),
    ),
  });
  // The default hyphenation is English; Dutch words must not be split by it.
  Font.registerHyphenationCallback((word) => [word]);
}

// Line height is set per text style, never inherited: react-pdf 4.9 compounds an
// inherited relative line height (a fixed footer grew on every page).
const lh = 1.38;
const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 56, paddingHorizontal: 48, fontFamily: ui, fontSize: 9.5, color: c.ink },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22 },
  logo: { fontSize: 17, fontWeight: 700, letterSpacing: -0.3 },
  topRight: { fontSize: 8.5, color: c.faint, textAlign: "right", lineHeight: lh },
  context: { fontSize: 8.5, color: c.faint, marginBottom: 3, lineHeight: lh },
  title: { fontSize: 22, fontWeight: 700, lineHeight: 1.15, letterSpacing: -0.3 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 8.5, color: c.soft },
  tag: { flexDirection: "row", borderWidth: 1, borderColor: c.ink, borderRadius: 3, marginRight: 10 },
  tagText: { paddingHorizontal: 5, paddingVertical: 1.5, fontSize: 8.5, fontWeight: 600, color: c.ink },
  tagCode: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    fontSize: 8.5,
    fontWeight: 700,
    color: "#fff",
    backgroundColor: c.ink,
  },
  metaItem: { marginRight: 10 },
  summary: {
    marginTop: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: c.ruleSoft,
    borderRadius: 4,
    backgroundColor: c.paper2,
  },
  summaryTitle: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  bar: { flexDirection: "row", height: 7, borderRadius: 3.5, overflow: "hidden", marginBottom: 9 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 14 },
  legendCount: { fontWeight: 700, marginLeft: 3, marginRight: 3 },
  hand: { fontFamily: "Hand", fontSize: 15, color: c.pen, lineHeight: 1 },
  h2: { fontSize: 11.5, fontWeight: 700, marginTop: 20, marginBottom: 6 },
  check: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    borderBottomWidth: 0.6,
    borderBottomColor: c.ruleSoft,
  },
  checkIcon: { width: 16, paddingTop: 0.5 },
  checkCode: { width: 62, fontSize: 8.5, fontWeight: 600, color: c.soft, paddingTop: 0.5 },
  checkWording: { flex: 1, fontSize: 9, paddingRight: 8, lineHeight: lh },
  checkState: { width: 98, alignItems: "flex-end" },
  verdict: { fontSize: 8.5, fontWeight: 600, lineHeight: lh },
  reviewFlag: { fontSize: 7.5, color: c.soft, marginTop: 1, lineHeight: lh },
  fileRow: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.6, borderBottomColor: c.ruleSoft },
  fileName: { flex: 1, fontFamily: doc, fontSize: 10, lineHeight: lh },
  fileMeta: { fontSize: 8.5, color: c.soft, lineHeight: lh },
  note: { marginTop: 16, fontSize: 8, color: c.faint, lineHeight: 1.45 },
  breakdownTitle: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  breakdownLead: { fontSize: 8.5, color: c.soft, marginBottom: 6, lineHeight: lh },
  goal: { paddingTop: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: c.rule },
  goalHead: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  goalCode: { fontSize: 9, fontWeight: 700, color: c.soft, marginLeft: 6, marginRight: 8 },
  goalWording: { fontSize: 10.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 8 },
  label: {
    fontSize: 8,
    fontWeight: 700,
    color: c.faint,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 9,
    marginBottom: 2,
  },
  body: { fontSize: 9.5, lineHeight: lh },
  confidence: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  track: { width: 60, height: 4, borderRadius: 2, backgroundColor: c.ruleSoft, marginRight: 6, overflow: "hidden" },
  small: { fontSize: 8.5, color: c.soft, lineHeight: lh },
  reviewNote: {
    marginTop: 6,
    padding: 6,
    borderLeftWidth: 2,
    borderLeftColor: c.pen,
    backgroundColor: c.paper2,
    fontSize: 8.5,
    lineHeight: lh,
  },
  bullet: { flexDirection: "row", marginBottom: 1.5 },
  bulletDot: { width: 10, color: c.soft },
  evidence: { marginTop: 4, marginBottom: 2 },
  evidenceHead: { fontSize: 8.5, fontWeight: 600, color: c.soft, lineHeight: lh },
  quote: {
    fontFamily: doc,
    fontStyle: "italic",
    fontSize: 10,
    marginTop: 2,
    paddingLeft: 7,
    borderLeftWidth: 1.5,
    borderLeftColor: c.marker,
    lineHeight: lh,
  },
  source: { flexDirection: "row", justifyContent: "space-between", marginTop: 8, fontSize: 7.5, color: c.faint },
  footer: {
    position: "absolute",
    bottom: FOOTER.bottom,
    left: FOOTER.side,
    right: FOOTER.side,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: FOOTER.size,
    color: c.faint,
    borderTopWidth: 0.6,
    borderTopColor: c.ruleSoft,
    paddingTop: 6,
  },
  // A long topic title is cut short instead of running into the page number.
  footerTitle: { width: 595.28 - 2 * FOOTER.side - FOOTER.counterWidth, maxLines: 1, textOverflow: "ellipsis" },
});

const tick = "M4.3 12.9c1.7 1.2 3.1 2.8 4.4 4.9 2.7-5.2 6.3-9.5 11-12.9";

/** The same pen marks as the site: a tick, a half circle, a cross and a question mark. */
function Mark({ verdict, size = 12 }: { verdict: Verdict; size?: number }) {
  const color = verdictColor[verdict];
  const stroke = {
    stroke: color,
    strokeWidth: 2.3,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {verdict === "covered" && <Path d={tick} {...stroke} />}
      {verdict === "partial" && (
        <>
          <Path d="M12 4.6a7.4 7.4 0 0 0 0 14.8Z" fill={color} />
          <Path
            d="M12.4 4.6c4.1.1 7.2 3.4 7.1 7.5-.1 4.1-3.4 7.3-7.5 7.3-4.1 0-7.4-3.3-7.4-7.4 0-3.6 2.6-6.6 6-7.3"
            {...stroke}
          />
        </>
      )}
      {verdict === "not_found" && (
        <>
          <Path d="M6.4 6.2c3.9 3.8 7.6 7.7 11.2 11.7" {...stroke} />
          <Path d="M17.7 6.1c-3.9 3.8-7.6 7.8-11.3 11.9" {...stroke} />
        </>
      )}
      {verdict === "uncertain" && (
        <>
          <Path
            d="M8.4 8.7c.3-2.5 2.1-4 4.3-3.8 2.3.2 3.7 1.9 3.4 4-.3 2-2.2 2.7-3.3 3.8-.7.7-.9 1.6-.8 2.8"
            {...stroke}
          />
          <Path d="M11.9 18.7l.1.1" {...stroke} strokeWidth={3} />
        </>
      )}
    </Svg>
  );
}

function Logo() {
  return (
    <View>
      <Text style={s.logo}>Krito</Text>
      <Svg width={46} height={8} viewBox="0 0 92 16" style={{ marginTop: -1 }}>
        <Path
          d="M2.5 10.2c14.4-2.1 32.8-2.9 50.6-2.4 6.3.2 12 .6 17.3 1.1"
          stroke={c.pen}
          strokeWidth={2.4}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M74.2 8.4c1.8 1.1 3.3 2.6 4.5 4.5 2.9-4.7 6.5-8.4 10.8-11.2"
          stroke={c.pen}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function Footer({ model }: { model: ReportModel }) {
  return (
    <View style={s.footer} fixed>
      {/* "pagina x van y" is stamped afterwards (render.tsx): react-pdf's
          render prop lays the whole document out twice. */}
      <Text style={s.footerTitle}>
        Krito · {model.title} · {model.group}
      </Text>
    </View>
  );
}

function Overview({ model }: { model: ReportModel }) {
  return (
    <>
      <View style={s.top}>
        <Logo />
        <Text style={s.topRight}>
          Verslag{"\n"}Analyse van {model.date}
        </Text>
      </View>
      {!!model.context && <Text style={s.context}>{model.context}</Text>}
      <Text style={s.title}>{model.title}</Text>
      <View style={s.meta}>
        <View style={s.tag}>
          <Text style={s.tagText}>{model.group}</Text>
          <Text style={s.tagCode}>{model.routeCode}</Text>
        </View>
        <Text style={s.metaItem}>{plural(model.goalCount, "leerdoel", "leerdoelen")}</Text>
        <Text style={s.metaItem}>{plural(model.files.length, "bestand", "bestanden")}</Text>
        <Text style={s.metaItem}>Op.stap v{model.catalogVersion}</Text>
      </View>

      <View style={s.summary} wrap={false}>
        <Text style={s.summaryTitle}>{plural(model.goalCount, "leerdoel", "leerdoelen")} beoordeeld</Text>
        <View style={s.bar}>
          {VERDICTS.filter((v) => model.counts[v]).map((v) => (
            <View key={v} style={{ flexGrow: model.counts[v], backgroundColor: verdictColor[v] }} />
          ))}
        </View>
        <View style={s.legend}>
          {VERDICTS.map((v) => (
            <View key={v} style={[s.legendItem, model.counts[v] ? {} : { opacity: 0.45 }]}>
              <Mark verdict={v} size={12} />
              <Text style={s.legendCount}>{model.counts[v]}</Text>
              <Text>{verdictLabels[v].toLowerCase()}</Text>
            </View>
          ))}
          {model.review > 0 && (
            <View style={s.legendItem}>
              <Text style={s.hand}>{model.review} om zelf na te kijken</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={s.h2} minPresenceAhead={40}>
        Alle leerdoelen
      </Text>
      {model.goals.map((g) => (
        <View key={g.code} style={s.check} wrap={false}>
          <View style={s.checkIcon}>
            <Mark verdict={g.verdict} size={11} />
          </View>
          <Text style={s.checkCode}>{g.code}</Text>
          <Text style={s.checkWording}>{g.wording}</Text>
          <View style={s.checkState}>
            <Text style={[s.verdict, { color: verdictColor[g.verdict] }]}>{g.label}</Text>
            {g.reviewNote && <Text style={s.reviewFlag}>Kijk zelf na</Text>}
          </View>
        </View>
      ))}

      <Text style={s.h2} minPresenceAhead={30}>
        Je bestanden
      </Text>
      {model.files.map((f, i) => (
        <View key={i} style={s.fileRow} wrap={false}>
          <Text style={s.fileName}>{f.name}</Text>
          <Text style={s.fileMeta}>
            {plural(f.pages, "pagina", "pagina's")} · {f.size}
          </Text>
        </View>
      ))}
      {model.skippedFiles.map((f, i) => (
        <View key={`skipped-${i}`} style={s.fileRow} wrap={false}>
          <Text style={s.fileName}>{f.name}</Text>
          <Text style={s.fileMeta}>Niet beoordeeld: {f.reason}</Text>
        </View>
      ))}

      <Text style={s.note}>
        Krito beoordeelt of je lesmateriaal een leerdoel ondersteunt, niet of leerlingen het beheersen. De verwijzingen
        en citaten zijn door een AI-model gekozen; leg ze naast je eigen bestand. Krito wijst aan, jij beslist.
      </Text>
    </>
  );
}

function GoalBlock({ goal }: { goal: ReportGoal }) {
  return (
    <View style={s.goal}>
      {/* The heading stays with the start of the goal; long text flows on to the next page. */}
      <View style={s.goalHead} wrap={false} minPresenceAhead={60}>
        <Mark verdict={goal.verdict} size={15} />
        <Text style={s.goalCode}>{goal.code}</Text>
        <Text style={[s.verdict, { color: verdictColor[goal.verdict] }]}>{goal.label}</Text>
        {goal.reviewNote && <Text style={[s.small, { marginLeft: 8 }]}>· Kijk zelf na</Text>}
      </View>
      <Text style={s.goalWording}>{goal.wording}</Text>
      <Text style={s.label} minPresenceAhead={24}>
        Beoordeling
      </Text>
      <Text style={s.body}>{goal.explanation}</Text>
      <View style={s.confidence} wrap={false}>
        <View style={s.track}>
          <View style={{ width: `${goal.confidence}%`, height: 4, backgroundColor: c.soft }} />
        </View>
        <Text style={s.small}>Zekerheid van beoordeling: {goal.confidence}/100</Text>
      </View>
      <Text style={[s.small, { marginTop: 2 }]}>{goal.confidenceReason}</Text>
      {goal.reviewNote && (
        <Text style={s.reviewNote} wrap={false}>
          {goal.reviewNote}
        </Text>
      )}
      {goal.missing.length > 0 && (
        <>
          <Text style={s.label} minPresenceAhead={20}>
            Wat ontbreekt
          </Text>
          {goal.missing.map((m, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>–</Text>
              <Text style={[s.body, { flex: 1 }]}>{m}</Text>
            </View>
          ))}
        </>
      )}
      <Text style={s.label} minPresenceAhead={30}>
        Bewijs uit je materiaal
      </Text>
      {goal.evidence.length ? (
        goal.evidence.map((e, i) => (
          <View key={i} style={s.evidence}>
            <Text style={s.evidenceHead} minPresenceAhead={24}>
              {e.file} · pagina {e.page}
            </Text>
            {e.quote && <Text style={s.quote}>“{e.quote}”</Text>}
            {!!e.description && <Text style={[s.small, { marginTop: 2 }]}>{e.description}</Text>}
          </View>
        ))
      ) : (
        <Text style={s.small}>Er werd geen passage in je materiaal gevonden voor dit doel.</Text>
      )}
      <View style={s.source} wrap={false}>
        <Text>{goal.rechecked ? "Onafhankelijk opnieuw gecontroleerd" : "Beoordeeld door Krito"}</Text>
        <Text>Officiële bron: {goal.sourceUrl}</Text>
      </View>
    </View>
  );
}

export function ReportDocument({ model }: { model: ReportModel }) {
  registerFonts();
  return (
    <Document
      title={`Krito - ${model.title} ${model.group}`}
      author="Krito"
      subject="Verslag"
      language="nl-BE"
      creator="Krito"
      producer="Krito"
      // Fixed dates make the pdf byte-identical on every render, so a retried
      // e-mail sends exactly the same attachment under the same idempotency key.
      creationDate={new Date(model.timestamp)}
      modificationDate={new Date(model.timestamp)}
    >
      <Page size="A4" style={s.page}>
        <Overview model={model} />
        <Footer model={model} />
      </Page>
      <Page size="A4" style={s.page}>
        <Text style={s.breakdownTitle}>Per leerdoel</Text>
        <Text style={s.breakdownLead}>
          Per doel de beoordeling, wat nog ontbreekt en het bewijs uit je eigen bestanden, in dezelfde volgorde als het
          overzicht.
        </Text>
        {model.goals.map((g) => (
          <GoalBlock key={g.code} goal={g} />
        ))}
        <Footer model={model} />
      </Page>
    </Document>
  );
}
