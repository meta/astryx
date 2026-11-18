---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s theme font check now accepts a Google Fonts or Bunny Fonts stylesheet `<link>` in the app's page head as loading the families it names: in `index.html`, `public/index.html`, `src/index.html`, or a Next.js root layout or `_document` (`.tsx`, `.jsx`, `.js`, `.mjs` or `.ts`, under `app/`, `pages/` or `src/`). An app that loads a theme's fonts that way no longer gets the warning. A link inside a comment, one whose `rel` is not `stylesheet`, or one from another host does not count. When a package theme ships no font stylesheet, the fix names the page file whose `<head>` the link goes in.

@josephfarina
