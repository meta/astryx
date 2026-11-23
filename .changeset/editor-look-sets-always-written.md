---
'@astryxdesign/core': patch
---

[experimental] Core's palette source, from which the theme editor's palette engine is generated, always writes every set a look derives for the editor: the category tints, the chart series and the status roles. A chart series the look would draw like an earlier one takes the nearest shade that stands apart and still reads; a card tint drawn like another tint or the page takes the nearest quieter tint that stands apart, else the nearest stronger one; a status role whose text or icon reads at no shade keeps the base theme's colors, with a note; and any other limit no shade meets is a note instead of a fallback to the base theme's. `themePalette()` and `defineTheme({palette})` are unchanged.

@josephfarina
