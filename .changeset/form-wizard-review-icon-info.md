---
'@astryxdesign/cli': patch
---

[fix] The `form-wizard-vertical` template declares its review banner icon as `info`, the meaning the banner shows, instead of `checkDouble`. A project whose icon set draws template icons by meaning now gets that set's info icon in the banner. A project whose main set wraps `@heroicons/react` keeps the check badge unless it picks a variant, and copies without an icon set are unchanged.

@josephfarina
