---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s theme font check now accepts a font service stylesheet `<link>` in the app's page head as loading the families it names: in `index.html`, `public/index.html`, `src/index.html`, or a Next.js root layout or `_document` (`.tsx`, `.jsx`, `.js`, `.mjs` or `.ts`, under `app/`, `pages/` or `src/`). An app that loads a theme's fonts that way no longer gets the warning. A link inside a comment, or one whose `rel` is not `stylesheet`, does not count. When a font is still missing, the fix names the file whose `<head>` the link goes in.

@josephfarina
