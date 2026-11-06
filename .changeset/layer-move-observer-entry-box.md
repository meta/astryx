---
'@astryxdesign/core': patch
---

[perf] While a Tooltip is open, following its trigger through a scroll no longer reads layout. Each frame of a scroll used to read the trigger's box once or twice and the viewport's size to re-arm the observer that follows the trigger. The box and the viewport now come from the observer's own report. The Tooltip follows its trigger on the same frames as before.

@cixzhang
