---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor`'s theme stylesheet check no longer fails on a theme's own files when the theme it extends is added too (`theme add d` and `theme add neutral`): a theme source, its build and the editor's generated files only extend the other theme, so they are not asked to import its stylesheet. An app file that imports an added theme's module without its stylesheet still fails the check.

@josephfarina
