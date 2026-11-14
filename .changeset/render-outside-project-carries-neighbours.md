---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render` outside a project carries the modules, stylesheets, JSON files and images a page imports from above its own folder, as long as they are inside the current folder. A page restored with its neighbours (`report-restored/app/report/page.tsx` beside `report-restored/components/`) and rendered again by the command its file prints used to leave those neighbours out, so the new file came back with `exact: false`.

@josephfarina
