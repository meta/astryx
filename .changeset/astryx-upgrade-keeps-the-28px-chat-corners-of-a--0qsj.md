---
'@astryxdesign/cli': patch
---

[feat] `astryx upgrade` keeps the 28px chat corners of a theme that sets neither `--radius-chat` nor `extends`, now that `--radius-chat` defaults to the container radius: it adds `--radius-chat` to the theme tokens, 28px or the page step of a literal radius scale, and leaves a TODO where it cannot read the theme.
@kentonquatman
