---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor` reads the tokens your own `<theme>.theme.ts` sets from what the build made of it, so any way of writing the file counts (a namespace import, a renamed `defineTheme`, a template, a spread of a shared object); before its first build the file is read as written, and a change the next build shows to make tokens read each other is refused with the files put back. The base theme's own values are never counted as yours, and they close a token loop and make a part read a token as the base theme's rules do. An accent your theme file sets is the color the palette picks text for, and an exact token your theme file also sets says the file's value shows.

@josephfarina
