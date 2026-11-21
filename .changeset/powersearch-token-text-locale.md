---
'@astryxdesign/core': patch
---

[fix] PowerSearch's popover token reads its value in the provider locale. Its "{n} items", "date range" and "{n} filters" summaries come from the catalog, a list value joins with the locale's list format ("a, b und c" in German), a number uses the locale's decimal mark, and a relative date reads as its choice ("3 days ago") instead of the stored key (`3d_ago`). `formatFilterValue` joins lists and reads relative dates the same way. In English, a relative date now reads as its choice and a count of 1,000 or more groups its digits ("1,000 items"); other English text is unchanged.

@nynexman4464
