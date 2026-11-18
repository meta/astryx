---
'@astryxdesign/cli': patch
---

[fix] The `form-wizard-vertical` template declares its review banner icon as `info`, the meaning the banner shows, instead of `checkDouble`. A project with an icon set now gets that set's info icon in the banner. Copies without an icon set are unchanged.

@josephfarina
