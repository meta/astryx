---
'@astryxdesign/core': patch
---

[fix] A DropdownMenu sub-menu whose `label` is not a string, such as emphasized text or a translated message component, is now named correctly: a drilled-in view is named by the label alone, not by the whole row with its description; a view nested in it names its Back row "Back to" that label; and in a bottom-sheet data menu the sheet takes that label's text as its name while its level shows. Sub-menus with string labels do not change.

@duytbp
