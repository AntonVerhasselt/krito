# UI copy and e-mail research: proposal

Status: draft for review, 2026-10-12. The plan is in [`email-and-report-plan.md`](email-and-report-plan.md).

**The e-mails themselves now live in [`/emails`](../../emails/README.md), one md file per e-mail.** Edit those files directly. This document holds the screen text that goes with them and the research behind the welcome sequence.

---

## 1. UI copy

### 1.1 Results page: download button

- Button: **Download als pdf**
- While busy: **Pdf maken…**
- Error: **De pdf lukte niet. Probeer het opnieuw.**

### 1.2 Analysis modal (`EmailGate`): changes

The title stays **Nog één ding**.

Lead text, with my pick marked ★:

1. ★ "Vul je e-mailadres in en Krito begint met nakijken. Je resultaat verschijnt meteen hier, en je krijgt het verslag ook als pdf in je mailbox."
2. "Vul je e-mailadres in en Krito begint met nakijken. Je ziet je resultaat hier, en we mailen je het verslag als pdf."

**Small notice under the field** (decided 2026-10-12). It's the same in both modals: small grey text under the input, no checkbox, no link.

> Je krijgt ook drie korte mails van mij over hoe Krito werkt. Uitschrijven kan altijd. — Anton

### 1.3 Mobile card above the upload (`SendToSelf`)

Only shown on a phone, above the drop zone, on a notepad sheet with a green pen note.

Heading:

1. ★ "Staan je bestanden op je computer?"
2. "Niet aan je computer?"
3. "Later verder op je computer?"
4. "Je lesmateriaal staat op je laptop?"
5. "Verder op je computer"

- Text: "Stuur jezelf een link naar {{topic}}, {{group}}. Op je computer voeg je dan je bestanden toe."
- Button: **Stuur dit naar mezelf**
- Small text under it: "Of neem hieronder een foto van een blad op papier."

### 1.4 Mobile modal (`SendToSelfGate`)

- Title: **Stuur dit naar jezelf**
- Lead: "We mailen je een link naar {{topic}}, {{group}}. Open hem op je computer en voeg daar je bestanden toe. Er start nu nog geen analyse."
- Label: **Je e-mailadres van school**. Placeholder: `naam@jouwschool.be`. The error texts are the same as the analysis modal.
- The small notice under the field is the same as in 1.2.
- Buttons: **Annuleer** · **Stuur de link**. While busy: **Versturen…**
- Success state:
  - Title: **Verstuurd**
  - Text: "Open de mail op je computer. Niets gekregen? Kijk dan even bij je ongewenste mail."
  - Button: **Sluit**
- Error when too many requests (`rate_limited`): "Je vroeg al een paar links aan. Probeer het later opnieuw."

### 1.5 FAQ (`Home.tsx`), "Welk e-mailadres moet ik invullen?"

> Je e-mailadres van school; een persoonlijke mailbox wordt niet aanvaard. Je resultaten verschijnen op de website, en je krijgt het verslag ook als pdf in je mailbox.

### 1.6 Privacy page: new section "E-mail"

> Als je je e-mailadres invult, sturen we je het verslag van je analyse als pdf, en drie korte mails van Anton over hoe Krito werkt. Vraag je op je gsm een link naar jezelf aan, dan sturen we je die link. We versturen mails via Resend. We zien of een mail geopend wordt en of er op een link geklikt wordt, zodat we weten welke mails nuttig zijn. Het verslag bevat de namen van je bestanden en citaten eruit. Krito bewaart zelf geen kopie van de pdf. Uitschrijven kan onderaan elke mail van die drie, en je e-mailadres gebruiken we niet voor iets anders.

- [ ] Verify Resend's retention of sent messages and attachments, and the EU region, before publishing this.

### 1.7 Unsubscribe page (`/uitschrijven`)

- Title: **Uitschrijven**
- Text: "Wil je geen mails meer van Anton over Krito? Verslagen die je zelf aanvraagt, krijg je nog wel."
- Button: **Schrijf me uit**
- After clicking: "Je bent uitgeschreven. Bedankt dat je Krito wilde proberen."

---

## 2. Research insights for the welcome sequence

These come from three research runs on gpt-6.1-sol with web search, checked on 2026-10-12. Each run had to quote a source, with URL and date, for every fact.

### 2.1 Facts we can use, with sources

| Fact | Source | Where it could go |
|---|---|---|
| "Op 1 september 2026 start in alle basisscholen het nieuwe leerplan Op.stap" (Catholic network) | [KOV, 26-05-2026](https://pro.katholiekonderwijs.vlaanderen/stand-van-zaken) | Context only. Teachers know this already |
| "Scholen en leraren moeten zelf nagaan of een methode de nieuwe minimumdoelen dekt." | [Klasse, 02-04-2026](https://www.klasse.be/775114/nieuwe-minimumdoelen-basisonderwijs-2/) | ★ The optional line in welcome 2B. It names the exact job Krito does, in the words of the trusted teachers' magazine |
| Full-time primary teachers report 42.9 h/week, of which 5.9 h is individual lesson planning and preparation, and 2.8 h general administration | [TALIS 2024 Flanders, tables 3.11/8.12/8.20](https://data-onderwijs.vlaanderen.be/documenten/bestanden/TALIS-2024-vlaanderen.pdf) (published 07-10-2025) | Possibly welcome 1, but it pulls the tone toward a pitch. I'd keep it out |
| 33.7% of primary teachers find administration a source of stress "in hoge mate"; 11.9% say the same of curriculum changes | TALIS 2024 Flanders | Same; better suited to the homepage than to a personal e-mail |
| Planlast = tasks that feel like "veel werk" for "weinig resultaat"; 83% of respondents experience a lot of planlast (7,165 education professionals, 2022) | [Onderwijsinspectie, 20-03-2024](https://data-onderwijs.vlaanderen.be/documenten/bestanden/persbericht-planlast-binnenstebuiten-maart2024.pdf) | Matches the homepage's "why" section |
| Vlor: new goals must come "met minimale planlast, maximale begeleiding" | [Vlor advies, 23-04-2025](https://s3-eu-west-3.amazonaws.com/vlor-prd/advice_final_attachments/Advies%20Minimumdoelen%20met%20ambitie%20voor%20alle%20leerlingen%20basisonderwijs.pdf) | — |
| "Scholen beslissen zelf of zij al dan niet met methodes werken" | [KOV FAQ](https://pro.katholiekonderwijs.vlaanderen/nieuw-leerplan-op-basis-van-de-principes-van-een-kennisrijk-curriculum/veelgestelde-vragen) | Supports the copy's respect for the teacher's own material ("jij beslist") |
| GO! published its new leerplan on 29-06-2026; OVSG is updating Leer Lokaal | [GO!](https://pro.g-o.be/nieuws/nieuwe-go-leerplandoelen-binnenkort-beschikbaar-in-smartschool/), [OVSG](https://www.ovsg.be/onze-themas/leerplannen-didactiek/basisonderwijs/leer-lokaal/faq-leer-lokaal) | Expect replies to welcome 3 asking for GO!/OVSG, which it already mentions |

### 2.2 What the research says about the sequence itself

- **A personal look helps.** A plain-looking e-mail got 57% more clicks in a NextAfter test (2024). That's one test, so it doesn't prove plain text always wins, but it supports Anton's personal style.
- **One concrete question:** recommended practice (Customer.io, 2026), though the uplift is unproven. Each e-mail asks exactly one.
- **Three e-mails** match the usual "start with 2–3" advice (MailerLite, 2025). MailerLite also advises sending the first one immediately; you chose +1 h, which still reads as prompt and leaves room for the report e-mail to arrive first.
- **Subject lines:** at most about 9 words / 60 characters (Mailchimp). All proposals fit, including with a long topic name. The `{{topic}}` subjects need a cap, so the copy builder truncates topic names over 40 characters.
- **The founder photo:** no evidence for or against. Keep it because it's honest and personal, not because of a number.
- **School mail:** Microsoft 365 and Google Workspace are common in Flemish schools, so SPF, DKIM and DMARC alignment on `mail.krito.be` is a must. Even with those, Workspace admins can quarantine mail.
- **Smartschool** stopped sending duplicate notification e-mails (Feb 2025), so school inboxes may be a little quieter.
- **When teachers read mail:** no reliable data. 2018 research shows about 30% of teachers work between 19:30 and 21:30. That supports not adding quiet hours.
- **Legal:** see the plan, §1.9. Named work addresses count as personal addresses, and soft opt-in for a free tool is uncertain. Keep the sequence about using the service, with an easy unsubscribe.

### 2.3 Claims to avoid (from the research)

- Any "Krito saves X hours" or "Op.stap costs X extra hours": no source.
- "Teachers spend a third of their time on administration": not supported.
- "18.4% of teachers have burn-out": that figure covers all school levels and is about symptoms, not a diagnosis.
- "Op.stap v1.3 is final or approved": KOV's approval procedure is still running (resubmission January 2027).
- "Every year group must implement everything from September 2026": rollout is phased until 2030–2031.
- "The inspectie requires a ticked goal list per lesson."
