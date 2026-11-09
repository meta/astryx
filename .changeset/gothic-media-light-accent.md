---
'@astryxdesign/theme-gothic': patch
'@astryxdesign/cli': patch
---

[fix] Gothic: accent text and accent icons stay readable on a light media surface. They used Gothic's light accent there, near-white on a light band (1.14:1); now they follow the surface's dark accent (16.3:1). The CLI's Gothic theme template carries the same change.

@cixzhang
