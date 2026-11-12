---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: corners set for a state (`corners pill --on button --state hover`) are accepted, and the result names the part's derived radius variable, which Core sets from the plain value only. Padding that a part expands into container spacing is refused with a state, judged on the part named (`--only` keeps it to one member of a group). `focus-within` is taken on a part that holds content. A one-mode value that is not a color is refused for that reason first.

`show` leaves every file in place when the theme source does not build, and names a token value that is not text. A theme named by a path or in capitals (`use ./themes/t`, `use T`) gets the editor-theme answer.

@josephfarina
