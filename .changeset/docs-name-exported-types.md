---
'@astryxdesign/core': patch
---

[docs] Four docs name prop types the package exports. Selector's `options` are `SelectorOptionType[]` (`SelectorOption` is a component), SyntaxTheme's `theme` is a `SyntaxThemeDefinition`, and `useImperativeDialog` and `useImperativeAlertDialog` write their `show()` options with the exported Dialog and AlertDialog props. Toast's doc marks the card's `isAutoHide` and `autoHideDuration` required, as `ToastProps` declares, and the show-only options (`uniqueID`, `collisionBehavior`, `onHide`) leave its props table, because `useToast`'s doc lists them with their defaults; `type` keeps its documented `'info'` default.

@cixzhang
