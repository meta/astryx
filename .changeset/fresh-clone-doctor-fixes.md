---
'@astryxdesign/cli': patch
---

[fix] In a fresh clone (a project that lists `@astryxdesign/core` and a theme package, with nothing installed yet), `astryx doctor` now says to install the project's dependencies, such as `npm install`, for a missing Core and a missing theme package. Before, its fixes added Core with no version and the theme package at the latest release, so following them replaced the project's versions with others.

@josephfarina
