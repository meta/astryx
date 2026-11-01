---
'@astryxdesign/core': patch
---

[feat] `ButtonGroup` gains `overflow="menu"` for horizontal groups. Members that no longer fit the space the group's parent offers collapse into a "More" `DropdownMenu`, where each collapsed `Button` (or `IconButton`) renders as an ordinary menu row through `ButtonGroupContext`, keeping its `label`, `icon`, `onClick`, `href`, `isDisabled`, and destructive variant; a disabled group disables the rows too. The group's surface hugs the members it shows, and collapsed members return when the row widens. The overflow trigger takes part in the group's roving focus, and a focused member that collapses hands focus to the trigger. `OverflowList` keeps its clipping while letting a child's focus ring paint.

@Lee-Dongwook
