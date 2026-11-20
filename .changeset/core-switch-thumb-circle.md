---
'@astryxdesign/core': patch
---

[fix] The switch thumb is drawn at a 50% radius instead of the `--radius-full` pill token, so a theme that squares its pills squares the switch track and keeps a round thumb. A theme that wants a square thumb sets the radius on `switch-thumb`.

@josephfarina
