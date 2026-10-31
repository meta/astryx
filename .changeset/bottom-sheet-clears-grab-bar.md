---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[feat] BottomSheet: at rest, a sheet's content starts below the grab bar whatever its `padding`, so the first line is no longer drawn through the bar's fade. The block-start inset is never less than the bar's height (`--spacing-6`): the band under the bar is not padding a child escapes, so a lone `Section` starts below the bar too; scrolled content still passes beneath it. A sheet at the default padding starts its content 8 px lower, one with `padding={0}` starts it below the bar, and one whose only child is a `Section` starts that Section 24 px lower and grows by the same amount. Core's own `padding={0}` sheets (the touch date and time pickers, DropdownMenu and ContextMenu sheets) no longer reserve that band themselves, so the pickers look the same and a menu's first row sits 8 px lower. The CLI's `table-filter` and `table-inbox` page templates drop their own band too, so it is not doubled.

@vjeux
