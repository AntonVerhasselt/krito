import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ReportDocument, FOOTER } from "./ReportDocument";
import { buildReportModel, type ReportInput } from "./model";
import { uiRegular } from "./fonts.generated";

/** Renders the pdf report. Server-only: used by the download action and the report e-mail. */
export async function renderReport(input: ReportInput) {
  const model = buildReportModel(input);
  const rendered = await renderToBuffer(<ReportDocument model={model} />);
  return { fileName: model.fileName, bytes: await numberPages(rendered) };
}

/** Writes "pagina x van y" in the footer of every page, in the report's own font. */
async function numberPages(bytes: Uint8Array) {
  // Keep react-pdf's fixed dates: the output must be identical on every render.
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(Buffer.from(uiRegular, "base64"), { subset: true });
  const pages = pdf.getPages();
  pages.forEach((page, i) => {
    const text = `pagina ${i + 1} van ${pages.length}`;
    const width = font.widthOfTextAtSize(text, FOOTER.size);
    page.drawText(text, {
      x: page.getWidth() - FOOTER.side - width,
      y: FOOTER.baseline,
      size: FOOTER.size,
      font,
      color: rgb(0x6b / 255, 0x74 / 255, 0x71 / 255),
    });
  });
  return pdf.save();
}
