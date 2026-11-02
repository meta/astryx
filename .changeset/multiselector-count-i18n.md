---
'@astryxdesign/core': patch
---

[fix] MultiSelector: the default count text on the trigger (`triggerDisplay="count"`, for example "2 selected") now comes from the message catalog (`@astryx.multiSelector.selectedCount`), so it is translated and can use plural forms under any locale. `formatValue` still replaces it.

@cixzhang
