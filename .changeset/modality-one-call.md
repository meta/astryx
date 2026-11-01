---
'@astryxdesign/core': patch
---

[fix] Components rendered into a same-origin iframe or a Document Picture-in-Picture window now read the last input in their own document for their keyboard focus rings and keyboard highlights (Slider, MultiSelector, DropdownMenu, ChatComposer, CommandPalette, panel search fields, menus), and for the ring on focus they move themselves. On the page, behavior is unchanged. Where an overlay returns focus on close is unchanged. vjeux wrote the original per-document fix, for Dialog (#8381); this extends it to every reader.

@cixzhang
