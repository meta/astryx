---
'@astryxdesign/cli': patch
---

[fix] Outside a project, `astryx doctor` now warns about an integration installed for the computer that has issues in its own files, and names them. Before, commands such as `astryx search` and `astryx discover` warned about the integration and said to run `astryx doctor`, but `doctor` passed and named no issue. Issues that need a comparison with Core components are still not named there, because `doctor` reads no Core outside a project.

@josephfarina
