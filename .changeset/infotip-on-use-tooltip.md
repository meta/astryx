---
'@astryxdesign/core': patch
---

[fix] InfoTip renders only its button and its help: the `display: contents` wrapper around the button is gone, and the button is the tooltip's trigger directly, built on `useTooltip`'s `show()` and `hide()`. What people see and hear is unchanged: hover and keyboard focus preview the help, a click, tap, Enter, or Space pins it until Escape, a second press, a press outside, or focus leaving, and a mouse press on a previewed help keeps it in view as it pins. Styles that reached the button through a wrapper selector now select the button itself.

@cixzhang
