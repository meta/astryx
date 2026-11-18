---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme`: a stop (Ctrl-C, SIGTERM) during `preview add`, `preview remove` or `preview app` now ends the command as stopped, with one line saying where the change stands, never `[ok]` with exit 0; a browser the editor stops at its 60-second bound is said to have timed out, Chrome's startup warnings are no longer given as the reason a picture failed, and a theme folder that cannot be written is named instead of the browser; Chrome gets a profile folder of its own that is removed however the run ends; the `see` fix for an in-app preview Next does not serve is one that works (`preview remove --path …`, then `preview add`, or "tsx" in pageExtensions); `preview app` from a subfolder prints a folder and `cd` that work from there, and its rule and docs name the project folder as the bound; and from a subfolder, the picture note names every picture with its full path.

@josephfarina
