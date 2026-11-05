---
'@astryxdesign/cli': patch
---

[fix] `astryx experimental render`: a page outside a project now renders. When the page's folder has no Astryx installed, the page takes `@astryxdesign/*`, React and StyleX (and the integrations a host approves) from the copy the CLI itself runs with, instead of failing with ERR_RENDER_MISSING_DEPENDENCY. The page and those packages load one copy of React and StyleX. Inside a project, the page still uses only the project's own packages.

@josephfarina
