---
'@astryxdesign/core': patch
---

[fix] Pagination: the dots variant now exposes the radio group it already behaves as. The container is a `radiogroup`, each dot is a `radio` named by its page ("Page 3") with `aria-checked` on the current page, so a screen reader announces the dot's position ("3 of 7") and the arrow-key behavior matches what it hears. Keyboard behavior is unchanged; `aria-current` is no longer set on the dots, since `aria-checked` carries the state.

@cixzhang
