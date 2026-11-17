---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` warns a typography value wherever the theme writes it (a const, a role const, a spread, an import, a value computed at run time), at the line that writes it when one does; a role weight that is no font weight (`'semi-bold'`, `'1200'`), which the browser drops; and a heading weight under a number key that is no level (`{7: '800'}`). Both the build and `astryx experimental theme` read a heading level as Core does, so `'01'` and `'1.0'` are level 1. On the font dial, a weight or style word after a name that starts with a family the editor knows (`Inter Tight Bold`) is read as a number there is: a weight where a family goes.

@josephfarina
