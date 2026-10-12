"use node";
import { degrees, PDFDocument } from "pdf-lib";
import type { FileType } from "../../shared/fileTypes";

/** A converted PDF may be larger than its source (slides become images). */
export const MAX_CONVERTED_BYTES = 30 * 1024 * 1024;

type ConverterConfig = { url: string; username: string; password: string };

/**
 * The converter could not be reached or was busy. `retryable` marks quick,
 * passing failures (a cold start, too many requests); a timeout or a missing
 * configuration is not worth waiting for again.
 */
export class ConverterUnavailable extends Error {
  constructor(
    readonly retryable: boolean,
    /** The converter's HTTP status; absent when it wasn't reached. */
    readonly status?: number,
  ) {
    super("conversion_unavailable");
  }
}

export function converterConfig(
  env: Record<string, string | undefined> = process.env,
): ConverterConfig {
  const url = env.CONVERTER_URL?.replace(/\/+$/, "");
  if (!url || !env.CONVERTER_USERNAME || !env.CONVERTER_PASSWORD)
    throw new ConverterUnavailable(false);
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

/**
 * Parses CSV text into rows. A quote opens a quoted cell only at the start of
 * a cell (after optional spaces), so a stray quote (12" scherm) stays text. Quoted cells may contain
 * the delimiter, doubled quotes and line breaks (Alt+Enter in Excel).
 * With `firstRecordOnly`, parsing stops after the first non-empty row.
 */
function parseCsv(text: string, delimiter: string, firstRecordOnly = false) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && atStart) {
      // Spaces before an opening quote (a, "b, c") are not part of the cell.
      quoted = true;
      atStart = false;
      field = "";
    } else if (char === delimiter) {
      row.push(field);
      field = "";
      atStart = true;
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      if (firstRecordOnly && row.join("").trim()) return rows;
      row = [];
      field = "";
      atStart = true;
    } else {
      field += char;
      if (char !== " ") atStart = false;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/**
 * LibreOffice reads CSV as comma-separated. Dutch Excel writes semicolons, so
 * semicolon- and tab-separated files are rewritten with commas.
 */
export function normalizeCsv(text: string) {
  const delimiters = [",", ";", "\t"];
  const counts = delimiters.map((d) => {
    const first = parseCsv(text, d, true).find((r) => r.join("").trim());
    return first ? first.length - 1 : 0;
  });
  const most = Math.max(...counts);
  const delimiter = delimiters[counts.indexOf(most)];
  if (delimiter === "," || !most) return text;
  return parseCsv(text, delimiter)
    .map((row) =>
      row
        .map((f) => (/[",\r\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
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
 * Starts a converter instance (Cloud Run scales to zero, and LibreOffice
 * takes a few seconds to start) so the conversions at analysis time don't
 * wait for it. Also tells whether the converter is healthy. Best effort:
 * failures only return false.
 */
export async function warmConverter(
  fetchImpl: typeof fetch = fetch,
  config?: ConverterConfig,
) {
  try {
    config ??= converterConfig();
  } catch {
    return false;
  }
  try {
    const response = await fetchImpl(`${config.url}/health`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
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
  } catch (error) {
    throw new ConverterUnavailable(
      !(error instanceof Error && error.name === "TimeoutError"),
    );
  }
  // Gotenberg answers 400 when LibreOffice cannot read the file (damaged,
  // password protected or not what its extension claims).
  if (response.status === 400) throw new Error("conversion_failed");
  if (!response.ok)
    throw new ConverterUnavailable(
      response.status >= 500 || response.status === 429,
      response.status,
    );
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  const pdf = Buffer.from(await response.arrayBuffer());
  if (pdf.length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  return pdf;
}

const zipBased = new Set(["docx", "pptx", "xlsx", "odt", "odp", "ods", "pages", "key", "numbers"]);
/**
 * Office, OpenDocument and iWork files are zip archives. One without a local
 * file header at the start or a central directory at the end (a truncated or
 * renamed file) can't be opened by anyone, so it's refused before converting.
 */
export function damagedArchive(bytes: Uint8Array, type: FileType) {
  if (!zipBased.has(type.extension)) return false;
  const header = [0x50, 0x4b, 0x03, 0x04];
  if (header.some((byte, i) => bytes[i] !== byte)) return true;
  // The end-of-central-directory record sits in the last 22 + 65,535 bytes.
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06)
      return false;
  return true;
}

/** Width × height from a PNG header, or 0 when it isn't one. */
export function pngPixels(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(16) * view.getUint32(20);
}
/**
 * pdf-lib decodes a PNG completely; above this many pixels that no longer fits
 * next to other work in a Convex action (512 MiB), so the converter does it.
 */
export const MAX_LOCAL_PNG_PIXELS = 16_000_000;

/**
 * Reads the EXIF orientation of a JPEG (1 when absent). Phones store photos
 * as shot and record how to turn them in this tag.
 */
export function jpegOrientation(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (marker === 0xda) break; // image data starts; no EXIF before it
    const start = offset + 4;
    if (
      marker === 0xe1 &&
      String.fromCharCode(...bytes.subarray(start, start + 4)) === "Exif"
    ) {
      const tiff = start + 6;
      const little = bytes[tiff] === 0x49;
      const u16 = (at: number) =>
        little
          ? bytes[at] | (bytes[at + 1] << 8)
          : (bytes[at] << 8) | bytes[at + 1];
      const u32 = (at: number) =>
        little
          ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) +
            bytes[at + 3] * 0x1000000
          : bytes[at] * 0x1000000 +
            ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]);
      const ifd = tiff + u32(tiff + 4);
      const entries = u16(ifd);
      for (let n = 0; n < entries; n++) {
        const entry = ifd + 2 + n * 12;
        if (entry + 10 > bytes.length) break;
        if (u16(entry) === 0x0112) {
          const value = u16(entry + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

/** Clockwise turn needed to show the photo upright (mirroring is ignored). */
const turnFor: Record<number, 0 | 90 | 180 | 270> = {
  1: 0,
  2: 0,
  3: 180,
  4: 180,
  5: 90,
  6: 90,
  7: 270,
  8: 270,
};

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
  // Fit on an A4 page in the photo's own orientation, turned upright.
  const turn = type.extension === "png" ? 0 : turnFor[jpegOrientation(data)];
  const sideways = turn === 90 || turn === 270;
  const [shownW, shownH] = sideways
    ? [image.height, image.width]
    : [image.width, image.height];
  const [width, height] = shownW > shownH ? [842, 595] : [595, 842];
  const scale = Math.min(width / shownW, height / shownH);
  const w = image.width * scale;
  const h = image.height * scale;
  // Bottom-left corner of the upright picture on the page.
  const bx = (width - shownW * scale) / 2;
  const by = (height - shownH * scale) / 2;
  // pdf-lib turns counter-clockwise around the anchor point (x, y).
  const anchor = {
    0: { x: bx, y: by },
    90: { x: bx, y: by + w },
    180: { x: bx + w, y: by + h },
    270: { x: bx + h, y: by },
  }[turn];
  const page = pdf.addPage([width, height]);
  page.drawImage(image, {
    ...anchor,
    width: w,
    height: h,
    rotate: degrees(-turn),
  });
  const out = Buffer.from(await pdf.save());
  if (out.length > MAX_CONVERTED_BYTES) throw new Error("converted_too_large");
  return out;
}
