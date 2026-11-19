---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme …`: a pasted form is read as the typed one. A var() naming a design token in other letters (`var(--Spacing-4)`) gets the line with that token, though others of its family are one letter away. A pasted entry with its setting and value in the other order (`'pill: corners'`, `'{"red":"background-color","on":"card"}'`) gets the same swapped line as the typed pair. A pasted object of several settings gives each setting's line its scope, from the object's own `on`/`when`/`state`/`mode`/`only` keys and from the flags typed with it, and never offers a scope key as a setting of its own. A pasted change line with a mode label and no old value (`--color-accent [light only] -> #7c3aed`) keeps the label as the mode. A change made when the build does not match the saved settings (after a hand edit) says so and lists its token changes against the saved settings, instead of saying the theme already showed it.

@josephfarina
