---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the check of a theme's own token values judges what a build made now writes, through one path for `show`, `set`, `undo` and `compile`. A value from an import, an expression, a spread or a computed key is judged by its built value; only the value a later key keeps counts; a pair is judged as the `light-dark()` it builds. The source is read only to name the file and line that hold each value (an imported file is named, not the theme file) and for what a build erases: a second `tokens` key, and a pair with other than two values. Typography is judged by the values the build was given: a scale base with a unit (which builds `NaNrem`) is refused with the number of pixels it means, a scale with a ratio and no base is named, a family written in quotes or holding `; { } < >` is refused with the working form, and `fallbacks` is checked as part of the family list it builds. A family set through typography no longer gets the phone note.

@josephfarina
