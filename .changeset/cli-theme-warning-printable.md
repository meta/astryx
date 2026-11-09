---
'@astryxdesign/cli': patch
---

[fix] `astryx component` prints a theme warning as one line: control and format characters in the configured `astryx.theme` value or the generated theme record print as `�`, so a newline or an escape sequence in a checkout cannot rewrite the terminal.

@bhamodi @cixzhang
