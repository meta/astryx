---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme` refuses what a build could not apply, at its place, and names the fonts a theme shows:

- In an editor theme, null under a style key, a pseudo-class or an at-rule is named once, with a fix that holds no null.
- A pseudo-class or pseudo-element typo anywhere in a selector (`::befor`, `:hover:focus-visble`, `:not(:hovr)`) is refused with the selector corrected; a block under a pseudo-class's bare name (`hover: {…}`) is told to start with a colon.
- A part's variable in the page's `tokens` map, which the part sets on its own element, is refused with the part-scoped line; a typo of one is named.
- A value read from another file is blamed on that file and line, through `export {name}` lists, re-exports, namespace imports, imported part blocks and imported single values.
- A named pipe, a device or a socket where the app copy goes is refused at once, never opened.
- Fonts: Apple Color Emoji and Noto Color Emoji count as the systems' own fonts. Apple's interface faces (SF Pro, SF Mono, New York) are told by the generic that reaches them (`system-ui`, `ui-monospace`, `ui-serif`), since browsers do not reach them by name. An installed font package's missing weights are named, a font service request with another axis before `wght` is read, and a weight between the hundreds (550) is named as the face it shows, as CSS font matching picks it.

@josephfarina
