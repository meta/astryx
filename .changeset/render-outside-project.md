---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render`: a page outside a project now renders. When the page's folder is not in a project (no Astryx project, and no Core, React or StyleX installed for it), the page takes `@astryxdesign/*`, React and StyleX (and the integrations a host approves) from the copy the CLI itself runs with, instead of failing with ERR_RENDER_MISSING_DEPENDENCY. When that copy's Core cannot be downloaded, a page that needs it fails with ERR_VERSIONS_UNAVAILABLE, as other commands that read Core do. Inside a project, including one that installs React but not Core, the page uses only the project's own packages.

@josephfarina
