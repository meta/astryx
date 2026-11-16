---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor`'s contrast checks measure a part inside Core's media surface (a button on a lightbox's dark island) as that surface draws it, in its own scheme whatever the page's mode: an untouched base ships no problem there, and a light-only color on the page's part makes none. A problem there is listed once, and its fix is a color in the surface's scheme, which reaches it; when the part lets the surface's ground through and the same text on the page needs the other color, no line is offered, so following the fixes never cycles.

@josephfarina
