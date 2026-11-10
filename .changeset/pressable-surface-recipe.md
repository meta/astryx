---
'@astryxdesign/core': patch
---

[docs] useClickableContainer documents a pressable surface without Card chrome: the hook on the surface, `usePressFeedback` with `interactionOverlayStyles.backgroundColor` for the hover tint and touch press, a visually hidden `<button>` or `<a>` as the named control, and `focusOutlineStyles.focusWithin` for the shared focus ring that ClickableCard draws. ClickableCard's docs point chrome-free use to it.

@cixzhang
