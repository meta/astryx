---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview add`: a short description that names a page template (`checkout`, `hero`, `a landing page`) takes the page `build` ranks first, instead of being refused. A description that is exactly a template's id or display name adds that page, or says why it was skipped. The Core stylesheet note follows the root layout's imports, so a stylesheet imported from a root `styles/` file counts. A theme font whose package the app lacks gets a note with the install line, and the Overview marks a font that is not installed.

@josephfarina
