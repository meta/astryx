---
'@astryxdesign/cli': patch
---

[fix] A kept entry in the per-user cache whose value is missing or has the wrong shape for what it holds is now worked out again and stored over, instead of being used: a damaged entry could make `search`, `doctor` or `template --list` fail until the folder was cleared.

@josephfarina
