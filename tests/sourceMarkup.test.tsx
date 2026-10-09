import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SourceMarkup } from "../src/components/SourceMarkup";
it("renders mathematical source content while excluding executable markup", () => {
  const html = renderToStaticMarkup(
    <SourceMarkup
      html={
        '<span onclick="steal()">Breuk: <math><mfrac><mn>3</mn><mn>4</mn></mfrac></math></span><script>steal()</script><img src="https://tracker.invalid" onerror="steal()"><a href="javascript:steal()">toelichting</a>'
      }
    />,
  );
  expect(html).toContain("<math><mfrac><mn>3</mn><mn>4</mn></mfrac></math>");
  expect(html).toContain("toelichting");
  expect(html).not.toMatch(
    /steal|onclick|onerror|tracker|javascript|<script|<img|<a /,
  );
});
