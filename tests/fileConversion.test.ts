import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fileTypeOf } from "../shared/fileTypes";
import {
  converterConfig,
  convertToPdf,
  convertsLocally,
  decodeText,
  imageToPdf,
  MAX_CONVERTED_BYTES,
  normalizeCsv,
} from "../convex/node/convert";

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
});

describe("csv and text preparation", () => {
  it("rewrites Dutch semicolon CSV with commas, keeping quoted fields", () => {
    expect(normalizeCsv('Naam;Opmerking\nJan;"ja; zeker"\nAn;3,5')).toBe(
      'Naam,Opmerking\nJan,ja; zeker\nAn,"3,5"',
    );
    expect(normalizeCsv("a\tb\n1\t2")).toBe("a,b\n1,2");
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
  it("reports a damaged image as unreadable", async () => {
    await expect(
      imageToPdf(Buffer.from("not an image"), fileTypeOf("a.png")!),
    ).rejects.toThrow("conversion_failed");
  });
});
