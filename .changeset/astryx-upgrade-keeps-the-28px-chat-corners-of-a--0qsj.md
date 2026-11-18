---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` keeps each theme's chat corners now that `--radius-chat` follows the container radius: it adds `--radius-chat` to the theme's tokens (28px, or the page step of its radius scale) unless the theme's container radius already gives that value, and the page step to each adaptation rule with a radius scale. A theme that extends another and has no radius scale of its own keeps the inherited value. It leaves a TODO where it cannot read the theme.
@kentonquatman
