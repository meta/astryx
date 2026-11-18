---
'@astryxdesign/core': patch
---

[feat] Themes can reach parts that painted with no target of their own. The default look does not change.

- Each key badge in Kbd carries `kbd-key`.
- The Typeahead result popup carries `typeahead-popup`.
- Calendar's range band and hover-preview band carry `calendar-range` and `calendar-range-preview`, with `start` and `end` on the first and last day.
- BottomSheet's grab bar carries `bottom-sheet-handle`.
- AlertDialog's title and description carry `alert-dialog-title` and `alert-dialog-description`, and a theme's `heading` and `text` rules no longer reach them. A theme that styled them through `heading` or `text` keeps that look by repeating those rules on `alert-dialog-title` and `alert-dialog-description`.
- LayoutHeader and LayoutFooter reflect `container` (`card`, `dialog` or `bottom-sheet`), so a theme can style a dialog's header without a card's.
- ToggleButton reflects `grouped` inside a ToggleButtonGroup.
- An accent Link's hover color reads `--link-hover-color` when a container or theme sets it.

@josephfarina
