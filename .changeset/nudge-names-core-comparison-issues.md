---
'@astryxdesign/cli': patch
---

[fix] When an integration has a component that replaces a name Core does not have, commands such as `astryx search` and `astryx discover` now print that issue themselves where `astryx doctor` cannot check it: outside a project, and in a project with no Core installed. Before, outside a project they said to run `astryx doctor`, which passed without naming it; in a project with no Core installed, `astryx doctor` reported every replacement, correct or not, as replacing a name that is not a Core component. Where no Core is available to compare with, a correct replacement is no longer reported as an error.

@josephfarina
