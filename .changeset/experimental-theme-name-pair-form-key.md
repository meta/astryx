---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor new` reads a setting typed after the name in the pair form with its key in quotes (`'"like": "neutral"'`, `'"accent": "red"'`) or swapped (`red=accent`, `stone=like`), never as words of the name; the base word is never a value (`neutral=like` is `--like neutral`, never a gray tint). The name typed as an option (`--theme t2`, `--name t2`, `--theme=t2`) is that name, and the refusal says the option is none of new's.

@josephfarina
