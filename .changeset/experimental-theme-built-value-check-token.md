---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: one built-value check for a theme's own token values runs before every build (`set`, `undo`, `show`, the preview) and in `compile`, so a value one refuses the other never writes. A `[light, dark]` pair on a token that is not a color is refused however the file gives it (an import, a const, a spread), naming the file and line that hold it. Typography weights are judged as the tokens they build. A private variable (`--_*`) and a key that is no token name (`color`) are refused with their line. A pair in the theme file is shown by its light and dark values in notes. `undo` of a token the theme's own source sets names that file and line.

@josephfarina
