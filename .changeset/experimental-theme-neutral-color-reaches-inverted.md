---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor set <theme> neutral <color>` now reaches the inverted surface tooltips and toasts draw on. As Core makes it from a neutral scale, it is the card surface of the other mode, from the neutral color's own shades and inside the ramp, so it carries the color in both modes (in dark, the shade next to white rather than white itself). The on-dark and on-light text takes the neutral shades the official theme maps them to. Before, a green-on-black theme kept Core's own pure white tooltip and toast.

@josephfarina
