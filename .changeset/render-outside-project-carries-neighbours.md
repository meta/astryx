---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` outside a project carries the modules a page imports from above its own folder, and the files those modules import, as long as they are inside the current folder. A page restored with its neighbours (`report-restored/app/report/page.tsx` beside `report-restored/components/`) and rendered again by the command its file prints used to leave those modules out, so the new file came back with `exact: false`. Where the render reads the page's `tsconfig.json` and `public/` images does not change.

@josephfarina
