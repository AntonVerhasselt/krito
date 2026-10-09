"use node";
import { PDFDocument } from "pdf-lib";
import type { FileType } from "../../shared/fileTypes";

/** A converted PDF may be larger than its source (slides become images). */
export const MAX_CONVERTED_BYTES = 30 * 1024 * 1024;

type ConverterConfig = { url: string; username: string; password: string };

export function converterConfig(
  env: Record<string, string | undefined> = process.env,
): ConverterConfig {
  const url = env.CONVERTER_URL?.replace(/\/+$/, "");
  if (!url || !env.CONVERTER_USERNAME || !env.CONVERTER_PASSWORD)
    throw new Error("conversion_unavailable");
  return {
    url,
    username: env.CONVERTER_USERNAME,
    password: env.CONVERTER_PASSWORD,
  };
}

/** Reads text as UTF-8, falling back to Windows-1252 (Excel's Dutch default). */
export function decodeText(bytes: Uint8Array) {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^\uFEFF/, "");
}

function splitCsvLine(line: string, delimiter: string) {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) {
      fields.push(field);
      field = "";
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/**
 * LibreOffice reads CSV as comma-separated. Dutch Excel writes semicolons, so
 * semicolon- and tab-separated files are rewritten with commas.
 */
export function normalizeCsv(text: string) {
  const first = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const counts = [",", ";", "\t"].map((d) => splitCsvLine(first, d).length - 1);
  const delimiter = [",", ";", "\t"][counts.indexOf(Math.max(...counts))];
  if (delimiter === "," || !Math.max(...counts)) return text;
  return text
    .split(/\r?\n/)
    .map((line) =>
      splitCsvLine(line, delimiter)
        .map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
        .join(","),
    )
    .join("\n");
}

/** UTF-8 with a byte order mark, which LibreOffice recognises reliably. */
function prepareSource(bytes: Buffer, type: FileType) {
  if (type.extension !== "csv" && type.extension !== "txt") return bytes;
  const text = decodeText(bytes);
  return Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(type.extension === "csv" ? normalizeCsv(text) : text, "utf8"),
  ]);
}

/**
 * Converts teaching material to PDF with Gotenberg (LibreOffice). The source
 * name is fixed so a teacher's file name never reaches the converter.
 */
export async function convertToPdf(
  bytes: Buffer,
  type: FileType,
  config: ConverterConfig = converterConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(prepareSource(bytes, type))], {
      type: type.contentType,
    }),
    `source.${type.extension}`,
  );
  // One page per sheet keeps wide tables readable and makes "page 2" mean sheet 2.
  if (type.kind === "spreadsheet") form.append("singlePageSheets", "true");
  let response: Response;
  try {
    response = await fetchImpl(`${config.url}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    throw new Error("conversion_unavailable");
  }
  // Gotenberg answers 400 when LibreOffice cannot read the file (damaged,
  // password protected or not what its extension claims).
  if (response.status === 400) throw new Error("conversion_failed");
  if (!response.ok) throw new Error("conversion_unavailable");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  return pdf;
}

/** JPG and PNG become a one-page PDF right here; no converter needed. */
export function convertsLocally(type: FileType) {
  return ["jpg", "jpeg", "png"].includes(type.extension);
}

export async function imageToPdf(bytes: Buffer, type: FileType) {
  // A pooled Buffer can start mid-way its ArrayBuffer, which pdf-lib misreads.
  const data = new Uint8Array(bytes);
  const pdf = await PDFDocument.create();
  let image;
  try {
    image =
      type.extension === "png"
        ? await pdf.embedPng(data)
        : await pdf.embedJpg(data);
  } catch {
    throw new Error("conversion_failed");
  }
  // Fit on an A4 page in the photo's own orientation.
  const [width, height] = image.width > image.height ? [842, 595] : [595, 842];
  const scale = Math.min(width / image.width, height / image.height);
  const page = pdf.addPage([width, height]);
  page.drawImage(image, {
    x: (width - image.width * scale) / 2,
    y: (height - image.height * scale) / 2,
    width: image.width * scale,
    height: image.height * scale,
  });
  const out = Buffer.from(await pdf.save());
  if (out.length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  return out;
}
