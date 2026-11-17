---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: a page that saves to `localStorage` or `sessionStorage` keeps working in a viewer that blocks storage, such as a sandboxed frame without allow-same-origin. There, touching storage throws, and the page went dead after its first paint. Now the file gives the page an in-memory storage with the same API, so what it saves lasts until the page closes. A file opened from disk or on a real site keeps its real storage.

@josephfarina
