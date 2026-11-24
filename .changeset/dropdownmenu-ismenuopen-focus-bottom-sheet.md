---
'@astryxdesign/core': patch
---

[docs] The `DropdownMenu` `isMenuOpen` prop description now says that mounting open without moving focus applies to the anchored popover. A menu presented as a bottom sheet is modal and manages its own initial focus, so focus moves inside it whenever it opens, on mount included. No behavior change.

@HelloOjasMutreja @korkt-kim
