---
'@astryxdesign/cli': patch
---

[docs] `astryx docs use-a-theme` now says how to make dark mode the default: pass `mode="dark"` to the root `Theme`. A server-rendered app also sets `<html data-theme="dark">`, so the first paint is dark.

@josephfarina
