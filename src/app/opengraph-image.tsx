import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* The share card: the hero question on the desk, beside a lesson marked in green pen. */

export const alt =
  "Krito: klopt je les nog met het nieuwe leerplan? Een lesvoorbereiding over magnetisme, nagelezen in groene pen.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ink = "#1d2422";
const inkSoft = "#505a56";
const pen = "#10804d";
const red = "#b03a2b";
const docBlue = "#2f5496";

// Read at module scope, so the card is rendered once at build time.
const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const [regular, bold, doc, hand] = await Promise.all([
  font("SchibstedGrotesk-Regular.ttf"),
  font("SchibstedGrotesk-Bold.ttf"),
  font("Carlito-Regular.ttf"),
  font("ReenieBeanie-Regular.ttf"),
]);

function Line({ width, marked }: { width: number; marked?: "green" | "red" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginBottom: 18 }}>
      <div style={{ width, height: 10, borderRadius: 5, background: "#d5dbd9" }} />
      {marked && (
        <div
          style={{
            width: width * 0.7,
            height: 4,
            marginTop: 5,
            borderRadius: 2,
            background: marked === "green" ? pen : red,
          }}
        />
      )}
    </div>
  );
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#e1e5e4",
          fontFamily: "Schibsted",
          color: ink,
          padding: "64px 0 0 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 620 }}>
          <div style={{ display: "flex", flexDirection: "column", width: 130 }}>
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>Krito</span>
            <svg width="130" height="22" viewBox="0 0 92 16" fill="none">
              <path
                d="M2.5 10.2c14.4-2.1 32.8-2.9 50.6-2.4 6.3.2 12 .6 17.3 1.1"
                stroke={pen}
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                d="M74.2 8.4c1.8 1.1 3.3 2.6 4.5 4.5 2.9-4.7 6.5-8.4 10.8-11.2"
                stroke={pen}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            style={{
              marginTop: 52,
              fontSize: 72,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: -2.5,
            }}
          >
            Klopt je les nog met het nieuwe leerplan?
          </div>
          <div style={{ marginTop: 30, fontSize: 30, lineHeight: 1.4, color: inkSoft }}>
            Per Op.stap-leerplandoel zie je wat er al in je materiaal zit en wat
            nog ontbreekt. Gratis.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 400,
            height: 600,
            marginLeft: 60,
            marginTop: 40,
            padding: "44px 40px",
            background: "#ffffff",
            fontFamily: "Doc",
            boxShadow: "0 26px 48px -20px rgba(29, 36, 34, 0.45)",
            transform: "rotate(2deg)",
          }}
        >
          <span style={{ fontSize: 18, color: docBlue }}>Magnetisme</span>
          <span style={{ fontSize: 30, color: "#1f3864", marginTop: 4, marginBottom: 28 }}>
            Les 2: Wat trekt een magneet aan?
          </span>
          <span style={{ fontSize: 18, color: docBlue, marginBottom: 14 }}>Lesdoelen</span>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Line width={210} marked="green" />
              <Line width={180} />
              <Line width={200} marked="green" />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                height: 44,
                fontFamily: "Hand",
                fontSize: 40,
                color: pen,
                marginLeft: 22,
                transform: "rotate(-4deg)",
              }}
            >
              GL3.16
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 6 }}>
                <path
                  d="M4.3 12.9c1.7 1.2 3.1 2.8 4.4 4.9 2.7-5.2 6.3-9.5 11-12.9"
                  stroke={pen}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <span style={{ fontSize: 18, color: docBlue, margin: "20px 0 14px" }}>Slot</span>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <Line width={190} marked="red" />
              <Line width={150} />
            </div>
            <span
              style={{
                fontFamily: "Hand",
                fontSize: 40,
                color: red,
                marginLeft: 30,
                transform: "rotate(-3deg)",
              }}
            >
              GL3.19?
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Schibsted", data: regular, weight: 400, style: "normal" },
        { name: "Schibsted", data: bold, weight: 700, style: "normal" },
        { name: "Doc", data: doc, weight: 400, style: "normal" },
        { name: "Hand", data: hand, weight: 400, style: "normal" },
      ],
    },
  );
}
