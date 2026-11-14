---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme preview`: no demo on the Components page takes focus as it mounts. A dialog part such as DialogHeader shows inside an open inline Dialog, and an open Popover is named. When the preview's theme is gone, its Colors page goes with it. `preview remove` refuses while a file of yours in the folder imports the preview pages, and its advice for a route changed by hand is to move it out of the folder. `preview list` with no preview says why `add` would refuse the folder instead of suggesting it. `remove` takes away the empty folders `add` made outside the routes folder too. Every page-template list suggestion names the command the way the app runs the CLI, in `--json` as in text.

@josephfarina
