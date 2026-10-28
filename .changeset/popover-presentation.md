---
'@astryxdesign/core': patch
---

[feature] Popover takes `presentation`, with the values DropdownMenu and Selector use: `'popover'` (the default, unchanged) anchors it to its trigger, `'bottom-sheet'` presents its content in a modal BottomSheet labeled by `label`, and `'adaptive'` uses the BottomSheet on a compact touch screen (a phone) and the anchored popover elsewhere, the way iOS presents a popover on an iPhone. Compact is the theme's compact definition: narrower than its `md` width point or shorter than 500 px. In a sheet, `placement`, `alignment`, `width`, `role`, `isModal` and `hasAutoFocus` do not apply, and `xstyle`, `className` and `style` style the sheet's panel. The sheet loads only when a popover can present one.

@vjeux
