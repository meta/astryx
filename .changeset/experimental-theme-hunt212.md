---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`:

- Custom properties that read each other are refused at their line: a token and a local token reading one another, and a part's own custom property reading itself.
- A pseudo-class after `::search-text` (`:current`) or `::scroll-marker-group` is accepted. A pseudo-element inside `:is()`, `:where()`, `:not()` or `:has()`, a pseudo-class after `::highlight()` other than `:window-inactive`, and a pseudo-element no browser knows (`::nopey`) are refused.
- A misspelled vendor property (`-webkit-line-clmap`, `WebkitApperance`) is refused, with the vendor property it is near.
- A value read from another file through array or nested destructuring (`const [first] = arr`, `const {a: {b}} = cs`) is blamed on that file and line.
- A null value's warning says what null means: it leaves the value unset, so it is warned at its line and the theme keeps working, while a boolean, NaN, an object or an array, which mean nothing in CSS, are refused.

@josephfarina
