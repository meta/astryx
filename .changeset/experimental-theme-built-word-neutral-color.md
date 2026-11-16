---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: `new` reads a built-in theme typed with another word (`theme neutral`, `neutral stone`) as the base, never as the neutral color dial, and a base or setting typed with its own quotes (`'base neutral'`, `"accent" red`, `'"base": "neutral"'`, `'padding: 8px'`) as that setting, never as words of the name. A setting `new` takes no option for points at the parts it is written on (`how '8px padding'`), in place of a `set` line `set` itself refuses. `undo` by a held value with a scope typed ranks the settings by how much of that scope they share, so `undo t red --on toggle-button` leads with a toggle-button setting rather than a whole-theme one.

@josephfarina
