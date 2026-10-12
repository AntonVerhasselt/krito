import { describe, expect, it } from "vitest";
import { isPersonalEmail } from "../shared/emailPolicy";

describe("isPersonalEmail", () => {
  it("refuses personal mailboxes, whatever the casing or spacing", () => {
    for (const email of [
      "juf.an@gmail.com",
      " Meester.Tom@Hotmail.BE ",
      "x@outlook.com",
      "x@telenet.be",
      "x@skynet.be",
      "x@icloud.com",
    ])
      expect(isPersonalEmail(email)).toBe(true);
  });
  it("refuses older and smaller Belgian provider domains", () => {
    for (const email of [
      "x@skynet.net",
      "x@belgacom.be",
      "x@tvcablenet.be",
      "x@mobistar.be",
      "x@orange.be",
      "x@base.be",
      "x@dommel.be",
      "x@easynet.be",
      "x@outlook.fr",
      "x@hotmail.co.uk",
    ])
      expect(isPersonalEmail(email)).toBe(true);
  });
  it("accepts school and organisation domains", () => {
    for (const email of [
      "an.peeters@sintjozef.be",
      "tom@go-atheneum.be",
      "directie@school.katholiekonderwijs.vlaanderen",
      "x@student.gmail.com.example.be",
    ])
      expect(isPersonalEmail(email)).toBe(false);
  });
});
