---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: the preview route renders its pages only in the browser, so a component that crashes a server render no longer stops `next build` when Components is the first page. next.config is read the way Next loads it: `.js` before `.mjs`, `.mts`, `export {config as default}`, a key set after the object, and the last of a repeated key; a config changed in other ways gets a note instead of a guess. Table pieces (TableHeader, TableBody, TableFooter) are no longer shown alone on the Components page. `preview add overview` (or another default page's id) brings back the default pages that are missing.

@josephfarina
