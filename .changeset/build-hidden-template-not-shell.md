---
'@astryxdesign/cli': patch
---

[fix] `astryx build` no longer starts a part, a change to an existing page, or a page it would put on the app shell from a template kept off the template gallery. The theme showcase, a page of sample product screens, was taken as the app shell; those requests now start from a real shell template.

@josephfarina
