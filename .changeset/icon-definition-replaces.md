---
'@astryxdesign/cli': patch
---

[experimental] Icon definitions can declare `replaces`: the name of an older definition they take the place of. The old name keeps answering, through every later replacement: an icon set's `map` key that uses it maps the new definition, a template's `icons` value and a definition named to `experimental icon map` or `add` mean the new one, and `astryx experimental icon <old name>` finds the icon drawn for the new one. `integration check` warns with each `map` key to rename (`icon_definition_replaced`), the next `experimental icon map` writes the new name, and `astryx doctor` warns when an installed set still uses an old key. `experimental icon --definitions` and the definition's docs page show what it replaces.

@josephfarina
