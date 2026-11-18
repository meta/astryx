---
'@astryxdesign/cli': patch
---

[experimental] `astryx template` writes each icon placeholder a template imports (`DeleteIcon` from `@astryxdesign/template-icons`) as the library icon that draws it, under the same name: the app's icon pack when it has one, else Heroicons. The component showcase source and build's setup notes do the same. No bundled template uses placeholders yet, so no copy changes.

@josephfarina
