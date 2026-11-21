---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor how` reads "its header" (or footer, title bar) as the header of the nearest container named before it in the same clause ("a dialog with no padding around its header" is the dialog's header, never the app's top bar). It reads a container's body with no part of its own ("the dialog body", never "the dialog body text") as the container, and a dialog's title bar as its header. A header after a container Core draws without one ("a menu header", "a card title bar") is that container, said missing. An edge place said after a verb that places a part ("the title bar sits at the top edge of the dialog") says where that part sits and makes it the container's, unless the sentence draws a line there; any other edge keeps its side ("a card with padding 24px along the left edge of the card"). A part said to span the full width fills what holds it (`width: 100%`) rather than a 720px cap.

@josephfarina
