---
'@astryxdesign/core': patch
---

[fix] A `Tooltip` no longer opens when an app moves focus by script to its trigger right after a mouse click or a tap that focused nothing, such as a click on page text. The last input was a pointer, so the focus is not keyboard focus. A text-field trigger still opens, as browsers mark a pointer's focus on a text field `:focus-visible`, and focus after a key press still opens the tooltip.

@cixzhang
