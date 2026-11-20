---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme whose palette names a palette recipe this CLI doesn't know is now refused plainly, and the file is left exactly as it is, instead of asking for the file to be fixed by hand. A recipe a newer CLI made gets the same refusal as `astryx theme palette generate`, with the update step that fits where the CLI runs; any other name is said to be no recipe Astryx makes, with the recipes this CLI knows.

@josephfarina
