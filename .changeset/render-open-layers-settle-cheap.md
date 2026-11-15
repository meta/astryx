---
'@astryxdesign/cli': patch
---

[fix] A page render that draws overlays open waits for React's queued work before it reads them, and no longer compares the page's markup turn after turn: a page whose overlays have settled is read at once, so the theme editor's sample page and sheet render as fast as before while each render stays the same every time. The theme editor's contrast checks reuse each part's token reads within a command.

@josephfarina
