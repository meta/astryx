---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: a whole-theme change names the parts it leaves out, with the line that reaches them: `set corners square` names the parts drawn as pills (badge, switch, calendar day…), which `--radius-full 0px` squares; `set --border-width` names the surfaces it does not reach (dialog, popover, menus, tooltip, toast…) and the dividers it thickens. The "thick borders on everything" answer gives a border to every surface the shared border width does not widen, the overlays that draw a fixed line of their own included, and keeps each divider at its own width.

@josephfarina
