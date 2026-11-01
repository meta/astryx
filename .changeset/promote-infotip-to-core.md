---
'@astryxdesign/core': patch
---

[component] Promote `InfoTip` from Lab to Core, imported from `@astryxdesign/core/InfoTip` or the package root: an info-icon button whose press pins its help. Hover and keyboard focus preview the help, and a click, tap, Enter, or Space pins it open until Escape, a second press, a press outside, or focus leaving, through Tooltip's `pressTrigger="toggle"`. Its default name is the translated "More information", and under a coarse pointer it takes taps out toward 44 px without taking a neighbour's. The `@astryxdesign/lab` `InfoTip` export is now a deprecated re-export of the Core component and is removed in the next release: import it from `@astryxdesign/core` instead.

@vjeux
