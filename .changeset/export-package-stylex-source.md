---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export` compiles the StyleX in a package that ships StyleX source, as an app's build does. A component from such a package, installed or linked in from a workspace, that uses `stylex.keyframes`, `stylex.defineVars`, `stylex.createTheme` or `stylex.firstThatWorks` used to fail with "Unexpected 'stylex.keyframes' call at runtime". Its styles now compile with the page's own class-name prefix, so they never share a class with Core's, and its animations run in the exported file. A file of the package that the page loads lazily carries its styles too. A package that ships compiled StyleX stays as it ships.

@josephfarina
