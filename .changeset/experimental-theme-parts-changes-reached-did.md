---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show` names under `missed` the parts the theme's own changes should have reached and did not, one of each kind first: with the accent changed, an inverted surface (a toast, a tooltip), a disabled part drawn as the accent at reduced opacity, a selected state on the base's fill, a status fill (an info banner); with the corners changed, a pill; with the border width changed, a borderless surface. Each comes with the one line that reaches it, its state named (`--state disabled`, `--state selected`). The text shows six and counts the other parts on the base's look; `--json` lists them all. A part whose only fill is the shared hover or pressed tint (a link, a menu item) is judged by its text, so it is no longer listed as unreached.

@josephfarina
