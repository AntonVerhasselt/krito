import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { convertsLocally, fileTypeOf } from "../shared/fileTypes";
import {
  converterConfig,
  convertToPdf,
  decodeText,
  imageToPdf,
  MAX_CONVERTED_BYTES,
  ConverterUnavailable,
  jpegOrientation,
  normalizeCsv,
} from "../convex/node/convert";
import sharp from "sharp";

const config = { url: "https://convert.example", username: "u", password: "p" };
const pdfBytes = Buffer.from("%PDF-1.7\n");

function fakeFetch(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe("fileTypeOf", () => {
  it("recognises teaching material by extension, case-insensitively", () => {
    expect(fileTypeOf("Les 3.PPTX")?.kind).toBe("presentation");
    expect(fileTypeOf("toets.docx")?.kind).toBe("document");
    expect(fileTypeOf("scores.xlsx")?.kind).toBe("spreadsheet");
    expect(fileTypeOf("lijst.csv")?.kind).toBe("spreadsheet");
    expect(fileTypeOf("notities.txt")?.kind).toBe("text");
    expect(fileTypeOf("les.pdf")?.contentType).toBe("application/pdf");
  });
  it("rejects unknown or missing extensions", () => {
    expect(fileTypeOf("foto.webp")).toBeNull();
    expect(fileTypeOf("README")).toBeNull();
    expect(fileTypeOf("archief.zip")).toBeNull();
    expect(fileTypeOf("toString.constructor")).toBeNull();
  });
});

describe("convertToPdf", () => {
  it("posts the file to Gotenberg with basic auth and a neutral name", async () => {
    const { impl, calls } = fakeFetch(new Response(pdfBytes));
    const out = await convertToPdf(
      Buffer.from("docx"),
      fileTypeOf("Mijn les.docx")!,
      config,
      impl,
    );
    expect(out.equals(pdfBytes)).toBe(true);
    expect(calls[0].url).toBe(
      "https://convert.example/forms/libreoffice/convert",
    );
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
    const form = calls[0].init.body as FormData;
    expect((form.get("files") as File).name).toBe("source.docx");
    expect(form.get("singlePageSheets")).toBeNull();
  });
  it("puts each spreadsheet sheet on one page", async () => {
    const { impl, calls } = fakeFetch(new Response(pdfBytes));
    await convertToPdf(Buffer.from("x"), fileTypeOf("a.xlsx")!, config, impl);
    expect((calls[0].init.body as FormData).get("singlePageSheets")).toBe(
      "true",
    );
  });
  it("separates unreadable files from an unavailable converter", async () => {
    const type = fileTypeOf("a.pptx")!;
    await expect(
      convertToPdf(
        Buffer.from("x"),
        type,
        config,
        fakeFetch(new Response("", { status: 400 })).impl,
      ),
    ).rejects.toThrow("conversion_failed");
    await expect(
      convertToPdf(
        Buffer.from("x"),
        type,
        config,
        fakeFetch(new Response("", { status: 503 })).impl,
      ),
    ).rejects.toThrow("conversion_unavailable");
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(
      convertToPdf(Buffer.from("x"), type, config, failing),
    ).rejects.toThrow("conversion_unavailable");
  });
  it("only retries quick, passing converter failures", async () => {
    const type = fileTypeOf("a.docx")!;
    const failure = (impl: typeof fetch) =>
      convertToPdf(Buffer.from("x"), type, config, impl).catch((e) => e);
    const busy = await failure(
      fakeFetch(new Response("", { status: 503 })).impl,
    );
    expect(busy).toBeInstanceOf(ConverterUnavailable);
    expect(busy.retryable).toBe(true);
    const timedOut = await failure((async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch);
    expect(timedOut.retryable).toBe(false);
    const refused = await failure(
      fakeFetch(new Response("", { status: 401 })).impl,
    );
    expect(refused.retryable).toBe(false);
    expect(() => converterConfig({})).toThrow(ConverterUnavailable);
  });
  it("refuses converted files that are too large", async () => {
    const big = new Response(new Uint8Array(1), {
      headers: { "content-length": String(MAX_CONVERTED_BYTES + 1) },
    });
    await expect(
      convertToPdf(
        Buffer.from("x"),
        fileTypeOf("a.docx")!,
        config,
        fakeFetch(big).impl,
      ),
    ).rejects.toThrow("converted_too_large");
  });
  it("needs the converter to be configured", () => {
    expect(() => converterConfig({})).toThrow("conversion_unavailable");
    expect(
      converterConfig({
        CONVERTER_URL: "https://c.example/",
        CONVERTER_USERNAME: "u",
        CONVERTER_PASSWORD: "p",
      }).url,
    ).toBe("https://c.example");
  });
  it.each(["CONVERTER_URL", "CONVERTER_USERNAME", "CONVERTER_PASSWORD"])(
    "fails without %s instead of sending an unauthenticated request",
    (name) => {
      const env: Record<string, string | undefined> = {
        CONVERTER_URL: config.url,
        CONVERTER_USERNAME: config.username,
        CONVERTER_PASSWORD: config.password,
      };
      delete env[name];
      expect(() => converterConfig(env)).toThrow(ConverterUnavailable);
      env[name] = "";
      expect(() => converterConfig(env)).toThrow(ConverterUnavailable);
    },
  );
  it.each([
    [401, false], [403, false], [404, false], [429, true], [500, true], [502, true], [503, true],
  ])("handles HTTP %i with retryable=%s", async (status, retryable) => {
    const error = await convertToPdf(
      Buffer.from("document"), fileTypeOf("a.docx")!, config,
      fakeFetch(new Response("Provider response with sensitive details", { status })).impl,
    ).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(ConverterUnavailable);
    expect((error as ConverterUnavailable).retryable).toBe(retryable);
    expect((error as Error).message).toBe("conversion_unavailable");
  });
  it("also enforces the PDF size limit when the response omits content-length", async () => {
    await expect(convertToPdf(
      Buffer.from("document"), fileTypeOf("a.docx")!, config,
      fakeFetch(new Response(new Uint8Array(MAX_CONVERTED_BYTES + 1))).impl,
    )).rejects.toThrow("converted_too_large");
  });
});

describe("csv and text preparation", () => {
  it("rewrites Dutch semicolon CSV with commas, keeping quoted fields", () => {
    expect(normalizeCsv('Naam;Opmerking\nJan;"ja; zeker"\nAn;3,5')).toBe(
      'Naam,Opmerking\nJan,ja; zeker\nAn,"3,5"',
    );
    expect(normalizeCsv("a\tb\n1\t2")).toBe("a,b\n1,2");
  });
  it("keeps line breaks inside quoted cells", () => {
    expect(
      normalizeCsv(
        'Les;Inhoud\r\n"Les 1\nMagneten";"polen; kracht"\r\nLes 2;kompas',
      ),
    ).toBe('Les,Inhoud\n"Les 1\nMagneten",polen; kracht\nLes 2,kompas');
  });
  it("treats a quote inside a cell as text", () => {
    expect(normalizeCsv('Maat;Toestel\n12";scherm\n15;laptop')).toBe(
      'Maat,Toestel\n"12""",scherm\n15,laptop',
    );
  });
  it("allows spaces before a quoted cell", () => {
    expect(normalizeCsv('Les; "Inhoud; deel 1"\nLes 2; kompas')).toBe(
      'Les,Inhoud; deel 1\nLes 2, kompas',
    );
  });
  it("leaves comma CSV and single columns alone", () => {
    expect(normalizeCsv("a,b\n1,2")).toBe("a,b\n1,2");
    expect(normalizeCsv("alleen\néén")).toBe("alleen\néén");
  });
  it("decodes UTF-8 and falls back to Windows-1252", () => {
    expect(decodeText(Buffer.from("\uFEFFcafé", "utf8"))).toBe("café");
    expect(decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9]))).toBe("café");
  });
  it("sends CSV to the converter as normalised UTF-8", async () => {
    const { impl, calls } = fakeFetch(new Response(pdfBytes));
    await convertToPdf(
      Buffer.from("a;b\n1;2"),
      fileTypeOf("x.csv")!,
      config,
      impl,
    );
    const file = (calls[0].init.body as FormData).get("files") as File;
    expect(Buffer.from(await file.arrayBuffer()).toString("utf8")).toBe(
      "\uFEFFa,b\n1,2",
    );
  });
  it("sends Windows-1252 text as UTF-8 with its accents intact", async () => {
    const { impl, calls } = fakeFetch(new Response(pdfBytes));
    await convertToPdf(Buffer.from([0x63, 0x61, 0x66, 0xe9]), fileTypeOf("a.txt")!, config, impl);
    const file = (calls[0].init.body as FormData).get("files") as File;
    expect(Buffer.from(await file.arrayBuffer()).equals(Buffer.from("\uFEFFcafé", "utf8"))).toBe(true);
  });
});

// 4×2 red JPEG and 3×5 blue PNG.
const jpg = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAQDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==",
  "base64",
);
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAAFAQMAAAC6v8ThAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAADUExURQAA/4p40lcAAAAHdElNRQfqCgkRKTAzyKNvAAAAJXRFWHRkYXRlOmNyZWF0ZQAyMDI2LTEwLTA5VDE3OjQxOjQ4KzAwOjAwzrO25QAAACV0RVh0ZGF0ZTptb2RpZnkAMjAyNi0xMC0wOVQxNzo0MTo0OCswMDowML/uDlkAAAAodEVYdGRhdGU6dGltZXN0YW1wADIwMjYtMTAtMDlUMTc6NDE6NDgrMDA6MDDo+y+GAAAAC0lEQVQI12NggAEAAAoAAef42voAAAAASUVORK5CYII=",
  "base64",
);

describe("images", () => {
  it("are accepted, with jpg and png converted without the converter", () => {
    expect(fileTypeOf("foto werkblad.JPG")?.kind).toBe("image");
    expect(convertsLocally(fileTypeOf("a.jpeg")!)).toBe(true);
    expect(convertsLocally(fileTypeOf("a.png")!)).toBe(true);
    expect(convertsLocally(fileTypeOf("a.gif")!)).toBe(false);
    expect(fileTypeOf("a.heic")).toBeNull();
  });
  it("become a one-page A4 PDF in the image's orientation", async () => {
    const wide = await PDFDocument.load(
      await imageToPdf(jpg, fileTypeOf("a.jpg")!),
    );
    expect(wide.getPageCount()).toBe(1);
    expect(wide.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
    const tall = await PDFDocument.load(
      await imageToPdf(png, fileTypeOf("a.png")!),
    );
    expect(tall.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });
  it("turns phone photos upright using their EXIF orientation", async () => {
    // A landscape-stored 40x20 photo that the phone marks "turn 90° clockwise".
    const stored = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#ff0000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect(jpegOrientation(stored)).toBe(6);
    expect(jpegOrientation(jpg)).toBe(1);
    const page = (
      await PDFDocument.load(await imageToPdf(stored, fileTypeOf("a.jpg")!))
    ).getPage(0);
    expect(page.getSize()).toEqual({ width: 595, height: 842 });
  });
  it("reports a damaged image as unreadable", async () => {
    await expect(
      imageToPdf(Buffer.from("not an image"), fileTypeOf("a.png")!),
    ).rejects.toThrow("conversion_failed");
  });
});
