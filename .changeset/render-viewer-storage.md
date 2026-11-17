---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental render`: a page that saves to storage or copies text keeps working in a viewer's frame that allows scripts but blocks storage or the clipboard (`sandbox="allow-scripts"`).

- **Storage:** there, touching `localStorage` or `sessionStorage` throws, and the page went dead after its first paint. Now the file gives the page an in-memory storage that acts as the browser's does, methods and properties alike (`localStorage.theme`, `Object.keys(localStorage)`). What it saves lasts until the page closes. A file opened from disk or on a real site keeps its real storage.
- **Clipboard:** a frame can leave `navigator.clipboard` out, refuse it by permissions policy, or refuse the write, so a page's own Copy button failed. Now the write falls back to the browser's copy command where Core's clipboard hook does. It resolves when the text was copied and rejects with `NotAllowedError` when it was not, so the page's own success and error paths run. `readText` rejects with `NotAllowedError`, as a browser does.

The share guide now says what such a frame allows: forms, storage in memory and copying work; a cookie write throws, fullscreen and printing do not work, and a link opens only when the viewer allows pop-ups.

@josephfarina
