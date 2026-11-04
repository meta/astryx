---
'@astryxdesign/cli': patch
---

[chore] Internal: the file read behind `astryx doctor --built` takes its file limit as an option, 20,000 unless a caller passes one, and the checks' messages name the limit the read used. The command's checks and output are unchanged. Not exported from the package entry point. (#9897)

@vjeux
