---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] A theme that gives a Card, a Dialog or a menu corners of different radii (`borderRadius: '12px 12px 0 0'` or a corner longhand such as `borderStartStartRadius`) now reaches what those components hand each corner to: a full-bleed Table or a bleeding List in a Card or a Dialog takes each corner as the container draws it, focus ring and row fills included, and the rows of a pointer menu (DropdownMenu's popover and sub-menu flyouts, and ContextMenu), sub-menu rows included, take the menu's shape less its padding; the touch sheet's list rows, and a drilled-in sub-menu view with its own header or footer, keep their own corners. An elliptical corner (`8px / 4px`) reaches a full-bleed Table; a List and menu rows subtract the padding from it, so they keep square corners there. A default Card, Dialog or menu inside a themed one keeps its own corners. Before, these children kept square corners, or took the first corner's radius at every corner when the CLI theme editor wrote the radius. The theme pipeline writes each corner to its own private variable for components whose derived `borderRadius` entry sets the new `corners` flag. A radius of one value draws as before.

@josephfarina
