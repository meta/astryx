---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build`:

- A plain-object theme a theme extends (`const b = {name: 'b', extends: neutralTheme, …}; export default {name: 'p', extends: b}`) is made with `defineTheme` first, so its own base, typography and `[light, dark]` pairs are kept, and one with no tokens builds.
- A misspelled field is named wherever the theme object comes from (a member, an array element, `Object.assign`), without a line where the source does not write it as one.
- The warning for a stylesheet the theme source imports names a package stylesheet by the specifier the source wrote, and is given by the editor's compile too.
- A plain-object theme whose getter throws is a failed load (`ERR_THEME_LOAD`) naming the file and the field, not `ERR_UNKNOWN`.

@josephfarina
