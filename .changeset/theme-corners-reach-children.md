---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[fix] A theme that gives a Card, a Dialog or a menu corners of different radii (`borderRadius: '12px 12px 0 0'`, a corner longhand such as `borderStartStartRadius`, or an elliptical `8px / 4px`) now reaches what those components hand each corner to: a full-bleed Table or List in a Card or a Dialog takes each corner as the container draws it, focus ring and row fills included, and a menu's rows take the menu's shape less its padding. Before, they took one radius for every corner, or none. The theme pipeline writes each corner to its own private variable for components whose derived `borderRadius` entry sets the new `corners` flag. A radius of one value draws as before.

@josephfarina
