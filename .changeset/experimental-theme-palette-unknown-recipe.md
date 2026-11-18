---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme whose palette was made with a palette recipe this CLI doesn't know (one a newer CLI brings) is now refused plainly. The message names the recipe and this CLI's version, says to update the CLI with the project's own install command for `@astryxdesign/cli@latest`, and leaves the file exactly as it is, instead of asking for the file to be fixed by hand.

@josephfarina
