---
'@astryxdesign/core': patch
---

[docs] useClickableContainer documents a pressable surface without Card chrome: the hook on the surface, `usePressFeedback` with `interactionOverlayStyles.backgroundColor` for the hover tint and touch press, a visually hidden `<button>` or `<a>` as the named control, and a focus ring from the `--focus-outline-*` tokens. ClickableCard's docs point chrome-free use to it.

@cixzhang
