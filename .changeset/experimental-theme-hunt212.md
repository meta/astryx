---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- Custom properties that read each other are refused at their line: a token and a local token reading one another, and a part's own custom property reading itself.
- A pseudo-class after `::search-text` (`:current`) or `::scroll-marker-group` is accepted. A pseudo-element inside `:is()`, `:where()`, `:not()` or `:has()`, a pseudo-class after `::highlight()`, and `:window-inactive` after any highlight but `::selection` are refused. A pseudo-element near a known one (`::befor`) is refused as that one misspelled; one missing from the CLI's selector data and near none (`::column`, `::scroll-button()`) is noted as possibly newer than the CLI, and built.
- A misspelled vendor property (`-webkit-line-clmap`, `WebkitApperance`) is refused, with the vendor property it is near.
- A value read from another file through array or nested destructuring (`const [first] = arr`, `const {a: {b}} = cs`) is blamed on that file and line.
- A null value is warned at its line and the theme keeps working, while a boolean, NaN, an object or an array, which mean nothing in CSS, are refused. The warning says what it builds: a null property leaves the base theme's value; a null token is kept by the browser as the token's value, so most properties that read it act as if they were not set (text keeps the surrounding color, a background goes transparent) and a font family reading it falls back to the browser's default font.

@josephfarina
