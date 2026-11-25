---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export --pictures` also takes pictures of the written file, to check how it looks before sharing it: a phone in light and dark, and a desktop window, after the page's script ran, with a browser already on the machine (the project's Playwright, else Chrome or Chromium). The pictures go into a temp folder, and the JSON adds `data.pictures` with their paths. With no browser, it says why in one line and the file stands as written. Without the flag nothing changes.

@josephfarina
