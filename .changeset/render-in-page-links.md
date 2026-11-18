---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`: a link to a place in the page (`<a href="#section">`) keeps working in a viewer that shows the file in a frame given its document inline (`srcdoc`), as many artifact viewers do. There the address resolves against the viewer's own page, so the click navigated the frame away and the page vanished. Now the file moves to that place, as a browser tab does: it scrolls there, sets `:target` for the page's CSS and fires `hashchange` for a page that routes by hash. `#` goes back to the top. This also holds in a viewer that cancels such a link itself, from its own listener on the frame's window or document, and only scrolls to the place: tabs and navigation that route on the address switch there too, also for a link inside a card that stops the click. A link the page cancels or handles itself, from any of its own listeners, one with a target, and a click with a modifier key keep their own way.

@josephfarina
