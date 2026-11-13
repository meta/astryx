---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: CSS read with the current specifications' grammar.

- The editor also reads the current specifications' grammar from `@csstools/css-syntax-patches-for-csstree` (a new dependency, pinned). It adds about 0.1 MB unpacked to the install (one 79 KB JSON file, no dependencies of its own), and loads only when the editor checks a CSS value; no other command loads it, and startup is unchanged. A property MDN marks obsolete but the specifications still define, as browsers ship it, is taken: `font-stretch`, so the font shorthand split names a command that works.
- A negative number the current grammar ranges at 0 or more is refused on a part (`line-height -1`, `gap -2px`), with the positive value as the suggestion.
- A `color-mix()` share outside 0% to 100% is refused for tokens, part colors and the color dials, and the mix with the share at its limit is suggested.
- A font size or weight given alone to `font` on a part (`small`, `1rem`, `700`) is suggested as `font-size` or `font-weight`, never as a family.
- A relative color that keeps its channels (`rgb(from red r g b)`) and `light-dark()` with the same color twice are read as that color. A `color-mix()` in a space the editor does not mix in, or a relative color that changes its channels, says so and suggests the nearest color it can work out.

@josephfarina
