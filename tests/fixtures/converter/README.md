# Converter regression fixtures

These are small, non-sensitive inputs for `npm run test:converter`.
The tests use these checked-in bytes; they do not download fixtures at runtime
or require Office/iWork to be installed.

| File | Expected PDF | Purpose |
| --- | --- | --- |
| `lesson.docx` | 2 pages | Explicit page break and text on both pages. |
| `slides.pptx` | 2 pages | Two slides, with text on each. |
| `scores.xlsx` | 2 pages | Two sheets, one PDF page per sheet; text must survive. |
| `dutch.csv` | 1 page | Semicolon columns, quoted semicolon, decimal comma and café accent. |
| `windows-1252.txt` | 1 page | Legacy encoding; Café must survive conversion. |
| `pages5-file.pages` | 1 page | Representative Pages import. |
| `keynote5-file.key` | 2 pages | Nonblank Keynote slides with styled text. |
| `numbers3-file.numbers` | 1 page | Representative Numbers import. |

The first five fixtures are original synthetic Krito test data under the
repository's MIT license. DOCX/XLSX are minimal OOXML ZIP archives.
`slides.fodp` is the editable presentation source. To regenerate its PPTX:

```bash
libreoffice --headless --convert-to pptx --outdir tests/fixtures/converter tests/fixtures/converter/slides.fodp
```

The three Apple fixtures are unmodified copies of
[LibreOffice/libetonyek's test data](https://github.com/LibreOffice/libetonyek/tree/6d19ce365f64a6217791a9438c85f4b1851ca7e0/src/test/data),
at commit `6d19ce365f64a6217791a9438c85f4b1851ca7e0`, distributed under MPL-2.0;
see [COPYING.libetonyek](COPYING.libetonyek). These samples do not establish
compatibility with every iWork version or package-directory format.
