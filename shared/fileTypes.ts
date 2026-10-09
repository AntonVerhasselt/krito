/**
 * Teaching material Krito accepts. Everything that is not already a PDF is
 * converted to PDF before analysis, so citations, page links and slide images
 * work the same for every file.
 */
export type FileKind =
  "pdf" | "document" | "presentation" | "spreadsheet" | "text" | "image";

const types: Record<string, { kind: FileKind; contentType: string }> = {
  pdf: { kind: "pdf", contentType: "application/pdf" },
  docx: {
    kind: "document",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  doc: { kind: "document", contentType: "application/msword" },
  odt: {
    kind: "document",
    contentType: "application/vnd.oasis.opendocument.text",
  },
  rtf: { kind: "document", contentType: "application/rtf" },
  pages: { kind: "document", contentType: "application/vnd.apple.pages" },
  pptx: {
    kind: "presentation",
    contentType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  ppt: { kind: "presentation", contentType: "application/vnd.ms-powerpoint" },
  odp: {
    kind: "presentation",
    contentType: "application/vnd.oasis.opendocument.presentation",
  },
  key: { kind: "presentation", contentType: "application/vnd.apple.keynote" },
  xlsx: {
    kind: "spreadsheet",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  xls: { kind: "spreadsheet", contentType: "application/vnd.ms-excel" },
  ods: {
    kind: "spreadsheet",
    contentType: "application/vnd.oasis.opendocument.spreadsheet",
  },
  numbers: {
    kind: "spreadsheet",
    contentType: "application/vnd.apple.numbers",
  },
  csv: { kind: "spreadsheet", contentType: "text/csv" },
  txt: { kind: "text", contentType: "text/plain" },
  // Photos of worksheets, scans and screenshots.
  jpg: { kind: "image", contentType: "image/jpeg" },
  jpeg: { kind: "image", contentType: "image/jpeg" },
  png: { kind: "image", contentType: "image/png" },
  gif: { kind: "image", contentType: "image/gif" },
  bmp: { kind: "image", contentType: "image/bmp" },
  tif: { kind: "image", contentType: "image/tiff" },
  tiff: { kind: "image", contentType: "image/tiff" },
};

export type FileType = {
  extension: string;
  kind: FileKind;
  contentType: string;
};

export function fileTypeOf(name: string): FileType | null {
  const match = /\.([a-z0-9]{2,7})$/i.exec(name.trim());
  const extension = match?.[1].toLowerCase();
  if (!extension || !Object.prototype.hasOwnProperty.call(types, extension))
    return null;
  return { extension, ...types[extension] };
}

/** Value for an `<input type="file" accept>` attribute. */
export const ACCEPTED_FILES = Object.entries(types)
  .flatMap(([extension, t]) => [`.${extension}`, t.contentType])
  .join(",");

/** Short list for teachers, in the order they are most likely to have them. */
export const ACCEPTED_LABEL =
  "PDF, Word, PowerPoint, Excel, CSV, tekst en afbeeldingen";
