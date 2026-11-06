---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render`: a page outside a project now renders. Outside a project (no Core or CLI the folder reads, and no package.json that declares one), the page takes the `@astryxdesign/*` packages its folder lacks, and the integrations a host approves, from the copy the CLI itself runs with, instead of failing with ERR_RENDER_MISSING_DEPENDENCY. React and StyleX come from that copy too, so the page loads one copy of each, even in a React app that installs its own. When that copy's Core cannot be downloaded, a page that needs it fails with ERR_VERSIONS_UNAVAILABLE, as other commands that read Core do. Inside a project, the page uses only the project's own packages.

@josephfarina
