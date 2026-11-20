---
'@astryxdesign/cli': patch
---

[experimental] `astryx template` writes each icon placeholder a template imports (`DeleteIcon` from `@astryxdesign/template-icons`) as the import of the icon the template icon table names for its variant (a Heroicon, or a Lucide icon for `/lucide`), under the same name. A project with an icon set then maps it like any declared template icon. The component showcase source and build's setup notes do the same.

@josephfarina
