---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: a `--path` that goes through a file, has a folder name longer than 255 bytes, or is longer than 3,500 bytes, is refused with a reason. A folder that differs from another only in case is refused for `preview app` and for a `--path` outside the routes folder too. `preview remove` leaves a page file it cannot read in place, says so and keeps it recorded. A preview flag given twice with different values is refused.

@josephfarina
