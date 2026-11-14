---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` loads imports with a Vite query as Vite does by itself: `?raw` gives the file's text, `?inline` a stylesheet's text (not added to the page) or an image's data, and `?url` an image's address; the files come back from `--reverse`. A query only a bundler plugin answers, such as `?react`, is refused with `ERR_RENDER_FAILED`, naming the import, where the render failed inside React ("Invalid tag") or could not load the file at all.

@josephfarina
