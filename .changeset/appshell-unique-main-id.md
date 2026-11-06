---
'@astryxdesign/core': patch
---

[fix] Two `AppShell`s on one page no longer share the main region's id. The first mounted shell keeps `id="astryx-app-shell-main"`, so single-shell pages, skip links and selectors that name it keep working. Each other shell's main region gets its own generated id, which its skip link targets. (#10199)

@cixzhang
