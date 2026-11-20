---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme whose palette names a palette recipe this CLI doesn't know is now refused plainly, and the file is left exactly as it is. A recipe a newer CLI made gets the same refusal as `astryx theme palette generate`, with the update step that fits where the CLI runs, instead of asking for the file to be fixed by hand. Any other name is said to be no recipe Astryx makes, and the refusal says to set `recipe` in the file to one of the recipes this CLI knows, naming them.

@josephfarina
