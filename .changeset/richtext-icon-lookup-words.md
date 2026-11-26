---
'@astryxdesign/richtext': patch
---

[docs] `astryx component RichTextEditor` names the toolbar's whole icon lookup: the theme icons, else the `registerIcons()` registry, falling back to a bundled SVG (was "the core icon registry").

@josephfarina
