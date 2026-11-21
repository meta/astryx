---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`: an effect (a text or box shadow, a filter) set on one part stays on that part. It reaches the other members of its family role only when `--on` names the group (`--on selected-items`, `--on button-like`). The always-alike groups (inputs, checks, menus) still take every change as one, and an overlay's lift (a box shadow, or a drop shadow drawn as a filter) still reaches the other overlays. A box shadow made only of inset rings (`inset 0 0 0 1px <color>` or `0 0 0 1px <color> inset`, with or without a color), how a border for one mode is written, is an edge and reaches as a border does; a ring followed by the part's own shadow stays on the part. An effect saved with a family record keeps the parts it reached when it was made.

@josephfarina
