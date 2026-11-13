---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental theme editor show`: a show that is refused (or fails to render) leaves the app copy in `src/themes/<theme>/` as it was; the copy is written once show succeeds. System files such as .DS_Store in the copy folder no longer stop the copy; a file of yours there does, and `wiring` then gives the steps by hand, naming that file.

@josephfarina
