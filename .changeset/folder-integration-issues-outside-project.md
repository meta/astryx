---
'@astryxdesign/cli': patch
---

[fix] Outside a project, when an integration that the folder loads itself (its own source, or a package it declares) has issues, commands such as `astryx search` and `astryx discover` now say to run `astryx doctor integration validate <package>`, which checks that copy. Before, they said to run `astryx doctor`, which outside a project checks only the integrations installed for the computer, so it named none of these issues. Those commands now print in full an issue that `astryx doctor integration validate` does not check, such as a template that replaces a template id Core does not have. For an integration installed for the computer that cannot load because a package it imports is missing, those commands now point to `astryx doctor integration validate <package>`, the command `astryx doctor` names for it.

@josephfarina
