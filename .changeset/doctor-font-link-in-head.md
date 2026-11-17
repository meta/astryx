---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s theme font check now accepts a font service `<link>` in the app's page head, as each theme's README describes it (in `index.html`, `public/index.html`, or a Next.js root layout or `_document`). Following the README no longer leaves the check failing. When a font is still missing, the fix names the file whose `<head>` the link goes in.

@josephfarina
