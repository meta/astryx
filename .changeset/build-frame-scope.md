---
'@astryxdesign/cli': patch
---

[fix] `astryx build` treats a frame as evidence for a page template only when the frame holds that template's kind of page. "Settings in a modal" frames a settings page, so the settings dialog can lead; "a toggle in a modal on the settings page" frames a toggle, a part of the page, so it does not.

@josephfarina
