---
'@astryxdesign/core': patch
---

[fix] Kbd shows the key names `useHotkeys` accepts by name, so one combo string works for both. `space` shows "Space" and is spoken "Space", and `arrowup`, `arrowdown`, `arrowleft` and `arrowright` show the arrow symbols and arrow names, where they showed "SPACE" or "ARROWUP" before. Kbd's docs no longer suggest it inside a Tooltip, whose dark surface leaves its keys hard to read; write the shortcut in the tooltip's text there.

@cixzhang
