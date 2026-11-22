---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a theme added from a shared theme with a palette a newer CLI made keeps every palette shade its app copy shows through the first change that leaves the colors alone (a corners change), instead of picking some again. Until the editor has built the theme in that app (no settings module there yet), it reads those shades from the app copy's stylesheet, each as the saved palette's stop that holds its color in that mode; a half no stop holds is read from the base theme, as a built module reads it.

@josephfarina
