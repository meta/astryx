---
'@astryxdesign/cli': patch
---

[fix] Outside a project, `astryx doctor integration validate <package>` now checks the copy of the package that the folder uses, an integration installed for the computer included. Before, it looked only in the `node_modules` at or above the folder and reported `package_not_found`, though `astryx doctor` names this command for an integration installed for the computer that it cannot load. A copy that the other commands skip for its peer ranges is checked too, with a note that says why: `cli_peer_version`, or the new `core_peer_version` when only its `@astryxdesign/core` range excludes this CLI's release.

@josephfarina
