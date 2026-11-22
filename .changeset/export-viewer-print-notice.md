---
'@astryxdesign/cli': patch
---

[experimental] A page made with `astryx experimental export` that calls `print()` inside a viewer's frame that ignores it (a sandboxed frame without allow-modals) now shows a notice that printing works when the file is opened in its own browser tab, with a button that closes it. The page's call still goes to the browser's own `print()` first, and the notice shows only when the browser started no print. A file opened in its own tab prints as before. The share guide now also says that such a frame blocks `alert()`, `confirm()`, `prompt()` and fullscreen, and to open the file in its own tab for them.

@josephfarina
