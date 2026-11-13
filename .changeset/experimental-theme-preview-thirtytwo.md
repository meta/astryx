---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: every in-app preview page has its own URL (`/theme-preview?page=components`), which the nav links to, so a link, a reload, the back button or a screenshot reaches any page; `preview add`, `list` and `app` give each page's URL. Every editor change carries a `see` line: the preview page most about it (Colors after a color, Components after a part, Overview otherwise) at its URL, else the editor's `preview.html`, and `--png`, which takes pictures with no dev server. The `--png` help says it needs a Playwright or a Chrome and adds a few seconds.

@josephfarina
