---
'@astryxdesign/core': patch
---

[feat] `Kbd` shows `ctrl`, `alt` and `shift` as text ("Ctrl", "Alt", "Shift") off Apple platforms and before hydration, and `meta` as "Win" off Apple platforms and before hydration, instead of Apple's ⌃ ⌥ ⇧ symbols and "META". Apple platforms keep the symbols, and spoken names are unchanged. The text comes from the catalog, so other locales can translate it.

@cixzhang
