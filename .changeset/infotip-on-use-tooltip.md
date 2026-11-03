---
'@astryxdesign/core': patch
---

[fix] InfoTip renders only its button and its help: the `display: contents` wrapper around the button is gone, and the button is the tooltip's trigger directly, built on `useTooltip`'s `show()` and `hide()`. Hover and keyboard focus still preview the help, and a click, tap, Enter, or Space still pins it until Escape, a second press, a press outside, or focus leaving. A mouse press on a previewed help keeps it in view as it pins, and a press that ends off the button leaves it closed. A right-click on a previewed help now closes it at once, as it does on any tooltip trigger. Styles that reached the button through a wrapper selector now select the button itself.

@cixzhang
