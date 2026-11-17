---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: a page keeps working in a viewer that blocks storage or the clipboard, such as a sandboxed frame without allow-same-origin.

- **Storage:** there, touching `localStorage` or `sessionStorage` throws, and the page went dead after its first paint. Now the file gives the page an in-memory storage with the same API, so what it saves lasts until the page closes. A file opened from disk or on a real site keeps its real storage.
- **Clipboard:** a frame can leave `navigator.clipboard` out, so a page's own Copy button threw and showed nothing. Now `writeText` copies through the copy command, as Core's clipboard fallback does: it resolves when the text was copied and rejects with `NotAllowedError` when it was not, so the page's own success and error paths run. `readText` rejects with `NotAllowedError`, as a browser does.

The share guide now says what a viewer's frame allows: links, forms, storage and copying work; fullscreen and printing do not.

@josephfarina
