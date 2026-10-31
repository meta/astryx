---
'@astryxdesign/core': patch
---

[fix] Components rendered into a same-origin iframe or a Document Picture-in-Picture window now follow the last input in their own document: keyboard focus rings, keyboard highlights and returned focus (Slider, MultiSelector, DropdownMenu, ChatComposer, CommandPalette, panel search fields, menus, BottomSheet, Dialog) no longer read the page's last input. Each component tracks its document through its one modality call, with no effect of its own. On the page, behavior is unchanged. vjeux wrote the original per-document fix, for Dialog (#8381); this extends it to every reader.

@cixzhang
