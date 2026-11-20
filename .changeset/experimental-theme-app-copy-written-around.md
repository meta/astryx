---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: the app copy in `src/themes/<theme>/` is written around a file of yours at another name (a note, a swap file); only a file of yours at one of the copy's names, or a link on the way to it, stops it, and then every change's result and `wiring` say the copy was not updated and why. The copy's `<theme>.fonts.css` is always there (a comment only when the theme loads no font stylesheet), so the app theme module's import of it holds when fonts or the base change; `compile` writes the whole copy, that file included. `new` refuses a name the theme commands skip (`a--b`, `b-`) and suggests the cleaned one. The package commands give true answers for an editor theme: `eject` says its source is yours already, and a path (`themes/<theme>`) is answered with the command by name.

@josephfarina
