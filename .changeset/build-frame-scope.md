---
'@astryxdesign/cli': patch
---

[fix] `astryx build` treats a frame as evidence for a page template only when the frame holds that template's kind of page. "Saved drafts in a modal with resume and delete row actions" asks for a list of drafts in a modal, not a settings page, so it no longer starts from the settings dialog; it starts from the app shell, with the parts listed in the kit.

@josephfarina
