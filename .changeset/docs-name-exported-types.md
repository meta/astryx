---
'@astryxdesign/core': patch
---

[docs] Component and hook docs name only types the package exports. Selector's `options` are `SelectorOptionType[]`, SyntaxTheme's `theme` is a `SyntaxThemeDefinition`, Markdown's `plugins` are what `createMarkdownPlugin()` returns, and `useImperativeDialog` and `useImperativeAlertDialog` write their `show()` options with the exported Dialog and AlertDialog props. Toast's doc describes the card: `type`, `isAutoHide` and `autoHideDuration` are required there, and `useToast`'s doc lists the show options and their defaults (`uniqueID`, `collisionBehavior`, `onHide`).

@cixzhang
