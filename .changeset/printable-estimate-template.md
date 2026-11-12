---
'@astryxdesign/cli': patch
---

[feat] `astryx template printable-estimate` scaffolds a document page that prints, or saves as PDF from the browser, on Letter or A4. It has a sender and client header, a line-item table whose header repeats on every printed page, totals and a signature block that stay on one page, and a screen-only toolbar with a paper-size control and a print button. `astryx docs print` covers page size and margins, the parts that draw with a fill and so do not print, page breaks in tables, and dark themes on paper. The `TemplateCategory` type adds `'Content - Printable Document'`.

@Dev-0710
